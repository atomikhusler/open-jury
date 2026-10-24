/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}"
  ],
  presets: [require("nativewind/preset")], // <-- This line fixes the error
  theme: {
    extend: {
      colors: {
        jury: {
          primary: "#3b82f6", 
          dark: "#0f172a",    
          surface: "#1e293b", 
          error: "#ef4444",   
        }
      }
    },
  },
  plugins: [],
}
