'use client';

import { useState, useRef, useEffect } from 'react';

interface PinInputProps {
  length?: number;
  onComplete: (pin: string) => void;
  disabled?: boolean;
}

export function PinInput({ length = 4, onComplete, disabled }: PinInputProps) {
  const [values, setValues] = useState<string[]>(new Array(length).fill(''));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    // Focus first input on mount
    inputRefs.current[0]?.focus();
  }, []);

  const handleChange = (index: number, value: string) => {
    if (disabled) return;

    // Only allow digits
    const digit = value.replace(/\D/g, '').slice(-1);

    const newValues = [...values];
    newValues[index] = digit;
    setValues(newValues);

    // Move to next input
    if (digit && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    // Check if complete
    const pin = newValues.join('');
    if (pin.length === length && !pin.includes('')) {
      onComplete(pin);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (disabled) return;

    if (e.key === 'Backspace' && !values[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (disabled) return;

    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);

    if (pastedData) {
      const newValues = new Array(length).fill('');
      pastedData.split('').forEach((char, i) => {
        if (i < length) newValues[i] = char;
      });
      setValues(newValues);

      // Check if complete
      if (pastedData.length === length) {
        onComplete(pastedData);
      } else {
        inputRefs.current[pastedData.length]?.focus();
      }
    }
  };

  const reset = () => {
    setValues(new Array(length).fill(''));
    inputRefs.current[0]?.focus();
  };

  return (
    <div className="flex justify-center gap-3">
      {values.map((value, index) => (
        <input
          key={index}
          ref={(el) => {
            inputRefs.current[index] = el;
          }}
          type="tel"
          inputMode="numeric"
          maxLength={1}
          value={value}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          disabled={disabled}
          className={`
            w-14 h-16 text-center text-2xl font-bold
            border-2 rounded-xl
            focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200
            transition-all
            ${disabled ? 'bg-gray-100 text-gray-400' : 'bg-white text-gray-900'}
            ${value ? 'border-blue-400' : 'border-gray-300'}
          `}
        />
      ))}
    </div>
  );
}
