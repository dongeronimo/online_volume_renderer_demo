import React from 'react';

export interface CheckboxEditorProps {
  value: boolean;
  onChange: (value: boolean) => void;
  label?: string;
  className?: string;
}

export const CheckboxEditor: React.FC<CheckboxEditorProps> = ({ 
  value, 
  onChange, 
  label,
  className = ""
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.checked);
  };

  return (
    <label className={`flex items-center cursor-pointer ${className}`}>
      <input
        type="checkbox"
        checked={value}
        onChange={handleChange}
        className="w-4 h-4 mr-2 cursor-pointer"
      />
      {label && <span>{label}</span>}
    </label>
  );
};