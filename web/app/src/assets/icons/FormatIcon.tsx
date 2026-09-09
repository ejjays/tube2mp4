import { IconProps } from './types';

import React from 'react';

const FormatIcon = ({ size = 24, ...props }: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    id="file-video-4"
    width={size}
    height={size}
    fill="#000"
    className="icon line-color"
    data-name="Line Color"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      id="secondary"
      fill="none"
      stroke="#2CA9BC"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="3"
      d="m13 12-2-1.5v3z"
    ></path>
    <path
      id="primary"
      fill="none"
      stroke="#00FFFF"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1"
      d="M6 21a1 1 0 0 1-1-1V7l4-4h9a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1Z"
    ></path>
  </svg>
);

export default FormatIcon;
