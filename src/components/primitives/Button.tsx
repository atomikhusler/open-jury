// src/components/primitives/Button.tsx
import React from 'react';
import { Pressable, Text, ActivityIndicator } from 'react-native';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  isLoading?: boolean;
  isDisabled?: boolean;
  className?: string;
}

export const Button = ({ 
  label, 
  onPress, 
  variant = 'primary', 
  isLoading = false, 
  isDisabled = false,
  className = ''
}: ButtonProps) => {
  const baseClasses = "flex-row items-center justify-center rounded-xl py-4 px-6 active:opacity-80";
  
  const variantClasses = {
    primary: "bg-jury-primary",
    secondary: "bg-jury-surface border border-slate-600",
    danger: "bg-jury-error",
  };

  const disabledClasses = isDisabled ? "opacity-50" : "";

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled || isLoading}
      className={`${baseClasses} ${variantClasses[variant]} ${disabledClasses} ${className}`}
    >
      {isLoading ? (
        <ActivityIndicator color="#ffffff" />
      ) : (
        <Text className="text-white font-bold text-lg">{label}</Text>
      )}
    </Pressable>
  );
};