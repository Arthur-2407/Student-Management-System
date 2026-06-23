import React from 'react';

interface GooeyButtonProps {
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void | Promise<void>;
  disabled?: boolean;
  type?: 'check-in' | 'check-out' | 'loading' | 'success-in' | 'success-out';
  children: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
}

export const GooeyButton: React.FC<GooeyButtonProps> = ({
  onClick,
  disabled,
  type = 'check-in',
  children,
  className = '',
  icon
}) => {
  const isCheckIn = type === 'check-in' || type === 'success-in';
  const isCheckOut = type === 'check-out' || type === 'success-out';
  const isLoading = type === 'loading';
  const isSuccess = type === 'success-in' || type === 'success-out';

  let themeClasses = '';
  if (isCheckIn) {
    themeClasses = 'border-emerald-500 text-emerald-600 hover:text-white [--blob-color:#10B981] focus:ring-emerald-500 bg-white';
    if (type === 'success-in') {
      themeClasses = 'border-emerald-500 bg-emerald-500 text-white cursor-not-allowed';
    }
  } else if (isCheckOut) {
    themeClasses = 'border-red-500 text-red-600 hover:text-white [--blob-color:#EF4444] focus:ring-red-500 bg-white';
    if (type === 'success-out') {
      themeClasses = 'border-red-500 bg-red-500 text-white cursor-not-allowed';
    }
  } else {
    themeClasses = 'border-gray-300 text-gray-400 bg-gray-50 cursor-not-allowed';
  }

  return (
    <div className="relative inline-block w-full">
      {/* SVG filter for the liquid morphing gooey effect */}
      <svg xmlns="http://www.w3.org/2000/svg" version="1.1" className="absolute w-0 h-0 block pointer-events-none">
        <defs>
          <filter id="gooey-liquid-filter-btn">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8" result="goo" />
            <feBlend in="SourceGraphic" in2="goo" />
          </filter>
        </defs>
      </svg>

      <button
        onClick={onClick}
        disabled={disabled || isLoading || isSuccess}
        className={`group relative w-full flex items-center justify-center gap-2 px-6 py-3 font-bold uppercase tracking-wider text-sm border-2 rounded-xl transition-all duration-300 overflow-hidden outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-75 disabled:cursor-not-allowed z-10 ${themeClasses} ${className}`}
        style={{
          boxShadow: disabled || isSuccess ? 'none' : '0 4px 14px 0 rgba(0, 0, 0, 0.04)',
        }}
      >
        {/* Gooey Blobs background logic */}
        {!(disabled || isSuccess || isLoading) && (
          <div 
            className="absolute inset-0 w-full h-full overflow-hidden rounded-lg -z-10 pointer-events-none"
            style={{ filter: "url('#gooey-liquid-filter-btn')" }}
          >
            <div className="absolute top-1/2 -translate-y-1/2 w-[35%] h-[150%] rounded-full bg-[var(--blob-color)] scale-0 group-hover:scale-[2.4] transition-transform duration-500 ease-out left-[-10%] origin-center delay-[0ms]" />
            <div className="absolute top-1/2 -translate-y-1/2 w-[35%] h-[150%] rounded-full bg-[var(--blob-color)] scale-0 group-hover:scale-[2.4] transition-transform duration-500 ease-out left-[25%] origin-center delay-[30ms]" />
            <div className="absolute top-1/2 -translate-y-1/2 w-[35%] h-[150%] rounded-full bg-[var(--blob-color)] scale-0 group-hover:scale-[2.4] transition-transform duration-500 ease-out left-[60%] origin-center delay-[60ms]" />
            <div className="absolute top-1/2 -translate-y-1/2 w-[35%] h-[150%] rounded-full bg-[var(--blob-color)] scale-0 group-hover:scale-[2.4] transition-transform duration-500 ease-out left-[95%] origin-center delay-[90ms]" />
          </div>
        )}

        {/* Content with icon and label */}
        <span className="relative flex items-center gap-2 z-20 group-hover:scale-[1.03] transition-transform duration-300">
          {isLoading ? (
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            icon
          )}
          {children}
        </span>
      </button>
    </div>
  );
};
