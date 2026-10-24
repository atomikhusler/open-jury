// src/utils/ranking-engine.ts
import {
  Participant,
  ScoreSubmission,
  Criterion,
  TieBreakerMethod,
} from '../types/database.types';

export interface RankingSettings {
  rankingEnabled: boolean;
  fairTrimEnabled: boolean; // Global Olympic Trim display toggle
  tieBreakerMethod: TieBreakerMethod;
}

export interface RankedParticipant {
  participant: Participant;
  rank: number | null; // null if rankingEnabled === false or un-scored
  judgeCount: number;
  rawSum: number;
  averageScore: number;
  olympicTrimmedSum: number;
  olympicTrimmedAverage: number;
  primaryDisplayScore: number; // Respects fairTrimEnabled + manual bonus
  weightedCriterionScore: number; // Sum of the designated tie-breaker criterion
  earliestTimestampMs: number | null; // Used for timestamp tie-breaker
  manualBonus: number; // +0.10 Chief Judge override
  isTied: boolean;
  needsManualOverride: boolean;
  tieResolutionNote: string | null;
}

const EPSILON = 0.0001;

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < EPSILON;
}

/**
 * Pure deterministic ranking and tie-breaking engine for Open Jury.
 */
export function calculateRankings(
  participants: Participant[],
  submissions: ScoreSubmission[],
  criteria: Criterion[],
  settings: RankingSettings
): RankedParticipant[] {
  // 1. Identify designated tie-breaker criterion (fallback to highest max_marks criterion if none flagged)
  const tieBreakerCriterion =
    criteria.find((c) => c.is_tie_breaker) ||
    [...criteria].sort((a, b) => b.max_marks - a.max_marks)[0] ||
    null;

  // 2. Group submissions by participant_id
  const subsByParticipant = new Map<string, ScoreSubmission[]>();
  for (const sub of submissions) {
    const list = subsByParticipant.get(sub.participant_id) || [];
    list.push(sub);
    subsByParticipant.set(sub.participant_id, list);
  }

  // 3. Build base metrics for every participant
  const metrics: RankedParticipant[] = participants.map((participant) => {
    const partSubs = subsByParticipant.get(participant.id) || [];
    const judgeCount = partSubs.length;
    const manualBonus = Number(participant.manual_tie_break_bonus || 0);

    if (judgeCount === 0) {
      return {
        participant,
        rank: null,
        judgeCount: 0,
        rawSum: 0,
        averageScore: 0,
        olympicTrimmedSum: 0,
        olympicTrimmedAverage: 0,
        primaryDisplayScore: 0,
        weightedCriterionScore: 0,
        earliestTimestampMs: null,
        manualBonus,
        isTied: false,
        needsManualOverride: false,
        tieResolutionNote: null,
      };
    }

    const judgeTotals = partSubs
      .map((s) => Number(s.total_score || 0))
      .sort((a, b) => a - b);

    const rawSum = judgeTotals.reduce((acc, val) => acc + val, 0);
    const averageScore = Number((rawSum / judgeCount).toFixed(2));

    // Olympic Trim: Drop single lowest and single highest judge score if 3+ judges
    let olympicTrimmedSum = rawSum;
    let olympicTrimmedAverage = averageScore;

    if (judgeCount >= 3) {
      const trimmedList = judgeTotals.slice(1, -1);
      olympicTrimmedSum = trimmedList.reduce((acc, val) => acc + val, 0);
      olympicTrimmedAverage = Number(
        (olympicTrimmedSum / trimmedList.length).toFixed(2)
      );
    }

    // Weighted Criterion Sum across all judges
    let weightedCriterionScore = 0;
    if (tieBreakerCriterion) {
      for (const sub of partSubs) {
        const val = sub.scores?.[tieBreakerCriterion.id];
        if (typeof val === 'number') {
          weightedCriterionScore += val;
        }
      }
    }

    // Timestamp: Use the completion timestamp (latest submission among judges for this participant)
    const timestamps = partSubs
      .map((s) => Date.parse(s.submitted_at))
      .filter((ms) => !Number.isNaN(ms));

    const earliestTimestampMs =
      timestamps.length > 0 ? Math.max(...timestamps) : null;

    const baseScore = settings.fairTrimEnabled ? olympicTrimmedSum : rawSum;
    const primaryDisplayScore = Number((baseScore + manualBonus).toFixed(2));

    return {
      participant,
      rank: null,
      judgeCount,
      rawSum,
      averageScore,
      olympicTrimmedSum,
      olympicTrimmedAverage,
      primaryDisplayScore,
      weightedCriterionScore,
      earliestTimestampMs,
      manualBonus,
      isTied: false,
      needsManualOverride: false,
      tieResolutionNote:
        manualBonus > 0 ? `+${manualBonus.toFixed(1)} Chief Judge Override` : null,
    };
  });

  // If automatic ranking is turned OFF by the Organiser, sort by Serial No. as a pure ledger
  if (!settings.rankingEnabled) {
    return metrics.sort((a, b) => a.participant.serial_no - b.participant.serial_no);
  }

  // 4. Separate scored vs un-scored participants
  const scored = metrics.filter((m) => m.judgeCount > 0);
  const unscored = metrics
    .filter((m) => m.judgeCount === 0)
    .sort((a, b) => a.participant.serial_no - b.participant.serial_no);

  // 5. Sort scored participants using the selected Tie-Breaker Cascade
  scored.sort((a, b) => {
    // Primary comparison: Primary Display Score (includes manualBonus if already applied)
    if (!nearlyEqual(b.primaryDisplayScore, a.primaryDisplayScore)) {
      return b.primaryDisplayScore - a.primaryDisplayScore;
    }

    // Scores are tied! Route through the configured tie-breaker method:
    switch (settings.tieBreakerMethod) {
      case 'weighted': {
        if (b.weightedCriterionScore !== a.weightedCriterionScore) {
          return b.weightedCriterionScore - a.weightedCriterionScore;
        }
        break;
      }

      case 'olympic_trim': {
        if (!nearlyEqual(b.olympicTrimmedSum, a.olympicTrimmedSum)) {
          return b.olympicTrimmedSum - a.olympicTrimmedSum;
        }
        break;
      }

      case 'timestamp': {
        if (a.earliestTimestampMs !== null && b.earliestTimestampMs !== null) {
          if (a.earliestTimestampMs !== b.earliestTimestampMs) {
            return a.earliestTimestampMs - b.earliestTimestampMs; // Earlier wins
          }
        }
        break;
      }

      case 'shared':
      case 'manual':
      default:
        break;
    }

    // Deterministic visual fallback: lower serial number appears first
    return a.participant.serial_no - b.participant.serial_no;
  });

  // 6. Assign Ranks & Flag Unresolved Ties
  for (let i = 0; i < scored.length; i++) {
    const current = scored[i];
    const prev = i > 0 ? scored[i - 1] : null;

    if (!prev) {
      current.rank = 1;
      continue;
    }

    const samePrimary = nearlyEqual(
      current.primaryDisplayScore,
      prev.primaryDisplayScore
    );

    if (!samePrimary) {
      current.rank = i + 1;
      continue;
    }

    // Primary scores were identical — check if the configured tie-breaker broke the tie
    let tieBrokenByMethod = false;

    if (
      settings.tieBreakerMethod === 'weighted' &&
      current.weightedCriterionScore !== prev.weightedCriterionScore
    ) {
      tieBrokenByMethod = true;
      const critName = tieBreakerCriterion?.name || 'Tie-Breaker Criterion';
      if (! prev.tieResolutionNote) {
        prev.tieResolutionNote = `Won tie via ${critName} (${prev.weightedCriterionScore} pts)`;
      }
      current.tieResolutionNote = `Tie-break: ${critName} (${current.weightedCriterionScore} pts)`;
    } else if (
      settings.tieBreakerMethod === 'olympic_trim' &&
      !nearlyEqual(current.olympicTrimmedSum, prev.olympicTrimmedSum)
    ) {
      tieBrokenByMethod = true;
      if (!prev.tieResolutionNote) {
        prev.tieResolutionNote = `Won tie via Olympic Trim (${prev.olympicTrimmedSum} pts)`;
      }
      current.tieResolutionNote = `Olympic Trim (${current.olympicTrimmedSum} pts)`;
    } else if (
      settings.tieBreakerMethod === 'timestamp' &&
      current.earliestTimestampMs !== prev.earliestTimestampMs
    ) {
      tieBrokenByMethod = true;
      if (!prev.tieResolutionNote) {
        prev.tieResolutionNote = 'Won tie via Earlier Timestamp';
      }
      current.tieResolutionNote = 'Later Timestamp';
    }

    if (tieBrokenByMethod) {
      current.rank = i + 1;
    } else {
      // Tie remains unbroken (either 'shared', 'manual', or identical secondary metrics)
      current.isTied = true;
      prev.isTied = true;
      current.rank = prev.rank; // Standard Competition Ranking (1, 2, 2, 4)

      if (settings.tieBreakerMethod === 'manual') {
        current.needsManualOverride = true;
        prev.needsManualOverride = true;
        current.tieResolutionNote = 'Awaiting Chief Judge Override';
        prev.tieResolutionNote = 'Awaiting Chief Judge Override';
      } else {
        current.tieResolutionNote = 'Shared Placement (Tie)';
        prev.tieResolutionNote = 'Shared Placement (Tie)';
      }
    }
  }

  return [...scored, ...unscored];
}