import React, { useState } from 'react';

interface SchoolCrestProps {
  size?: number;
  className?: string;
}

export const SCHOOL_LOGO_URL = '/assets/aistudio/Citizens_s.s_a01937a3.jpg';

export const SchoolCrest: React.FC<SchoolCrestProps> = ({ size = 48, className = '' }) => {
  const [imgFailed, setImgFailed] = useState(false);

  if (!imgFailed) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`bg-white rounded-lg p-0.5 flex items-center justify-center overflow-hidden shrink-0 ${className}`}
      >
        <img
          src={SCHOOL_LOGO_URL}
          alt="Citizens' Secondary School - Kasese Logo"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="w-full h-full object-contain"
        />
      </div>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Citizens' Secondary School - Kasese Crest"
    >
      <path
        d="M50 6L88 18V47C88 69.5 71.5 87.5 50 94C28.5 87.5 12 69.5 12 47V18L50 6Z"
        fill="#0F2744"
        stroke="#0284C7"
        strokeWidth="3"
      />
      <path
        d="M50 13L81 23V46.5C81 65 67.5 80 50 86C32.5 80 19 65 19 46.5V23L50 13Z"
        fill="#FFFFFF"
      />
      <text
        x="50"
        y="55"
        textAnchor="middle"
        fill="#0F2744"
        fontSize="11"
        fontWeight="700"
      >
        CSS
      </text>
    </svg>
  );
};
