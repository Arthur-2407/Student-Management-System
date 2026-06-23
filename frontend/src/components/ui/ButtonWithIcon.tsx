import React from 'react';
import { FaCalendarAlt, FaCheck } from 'react-icons/fa';

interface ButtonWithIconProps {
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void | Promise<void>;
  disabled?: boolean;
  loading?: boolean;
  success?: boolean;
  text?: string;
  loadingText?: string;
  successText?: string;
  icon?: React.ReactNode;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
}

export const ButtonWithIcon: React.FC<ButtonWithIconProps> = ({
  onClick,
  disabled = false,
  loading = false,
  success = false,
  text = 'REQUEST LEAVE',
  loadingText = 'Submitting...',
  successText = 'REQUEST SUBMITTED',
  icon = <FaCalendarAlt className="transition-transform duration-300 group-hover:scale-110" />,
  type = 'button',
  className = '',
}) => {
  // Determine text to show
  let buttonText = text;
  if (loading) buttonText = loadingText;
  else if (success) buttonText = successText;

  // Determine icon to show
  let buttonIcon = icon;
  if (loading) {
    buttonIcon = (
      <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    );
  } else if (success) {
    buttonIcon = <FaCheck className="text-white h-4 w-4 animate-bounce" />;
  }

  // Determine styling based on current state
  let stateClasses = 'bg-[#15CCBE] border-[#0F988E] text-white hover:bg-[#0F988E] hover:shadow-lg hover:shadow-[#15CCBE]/25 active:scale-[0.98]';
  if (loading) {
    stateClasses = 'bg-[#0F988E] border-[#0F988E] text-white opacity-90 cursor-wait';
  } else if (success) {
    stateClasses = 'bg-emerald-500 border-emerald-600 text-white cursor-not-allowed';
  } else if (disabled) {
    stateClasses = 'bg-gray-300 border-gray-400 text-gray-500 cursor-not-allowed';
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading || success}
      className={`group flex items-center justify-center gap-2 px-6 py-3 font-semibold uppercase tracking-wider text-sm border-2 rounded-xl transition-all duration-300 ease-out outline-none focus:ring-2 focus:ring-[#15CCBE] focus:ring-offset-2 ${stateClasses} ${className}`}
      style={{
        boxShadow: disabled || success || loading ? 'none' : '0 4px 14px 0 rgba(21, 204, 190, 0.15)',
      }}
    >
      <span className="flex items-center gap-2 z-10 transition-transform duration-300 group-hover:translate-x-0.5">
        {buttonIcon}
        <span>{buttonText}</span>
      </span>
    </button>
  );
};

export default ButtonWithIcon;
