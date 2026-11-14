import React from 'react';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: () => void;
  label?: string;
  disabled?: boolean;
  title?: string;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  label,
  disabled = false,
  title,
}) => {
  return (
    <div className="inline-flex items-center gap-2 select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label || 'Переключатель'}
        disabled={disabled}
        onClick={onChange}
        title={title}
        className={`relative inline-flex h-[24px] w-[44px] shrink-0 items-center rounded-full p-[2px] transition-all duration-300 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60 ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
        } ${
          checked
            ? 'bg-gradient-to-r from-[#F97316] to-[#EF4444] shadow-[0_0_12px_rgba(249,115,22,0.45)]'
            : 'bg-white/20 border border-white/10 hover:bg-white/25'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-[18px] w-[18px] rounded-full bg-white shadow-md shadow-black/40 transition-transform duration-300 ease-in-out ${
            checked ? 'translate-x-[20px]' : 'translate-x-0'
          }`}
        />
      </button>

      {label && (
        <button
          type="button"
          disabled={disabled}
          onClick={onChange}
          title={title}
          className={`text-[11px] font-medium transition-colors duration-200 ${
            disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
          } ${checked ? 'text-orange-300' : 'text-white/50 hover:text-white/75'}`}
        >
          {label}
        </button>
      )}
    </div>
  );
};
