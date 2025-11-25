import React, { useState } from 'react';

export interface FloatEditorProps {
  value: number;
  onChange: (value: number) => void;
  placeholder?: string;
  className?: string;
  width?: string | number; // Add width prop
}

export const FloatEditor: React.FC<FloatEditorProps> = ({ 
  value, 
  onChange, 
  placeholder = "Enter a number",
  className = "",
  width 
}) => {
  const [inputValue, setInputValue] = useState(value.toString());

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    
    // Allow empty string, minus sign, decimal point, and valid float formats
    if (newValue === '' || newValue === '-' || newValue === '.' || newValue === '-.') {
      setInputValue(newValue);
      return;
    }

    // Validate if it's a valid float (positive or negative)
    const floatRegex = /^-?\d*\.?\d*$/;
    if (floatRegex.test(newValue)) {
      setInputValue(newValue);
      
      // Parse and call onChange if it's a complete valid number
      const parsed = parseFloat(newValue);
      if (!isNaN(parsed)) {
        onChange(parsed);
      }
    }
  };

  const handleBlur = () => {
    // On blur, ensure we have a valid number or reset to the prop value
    const parsed = parseFloat(inputValue);
    if (isNaN(parsed) || inputValue === '' || inputValue === '-' || inputValue === '.' || inputValue === '-.') {
      setInputValue(value.toString());
    } else {
      setInputValue(parsed.toString());
      onChange(parsed);
    }
  };
  const style = width ? { width: typeof width === 'number' ? `${width}px` : width } : undefined;

  return (
    <input
      type="text"
      value={inputValue}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={placeholder}
      style= {style}
      className={`px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
    />
  );
};

