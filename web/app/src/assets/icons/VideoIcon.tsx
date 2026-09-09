import { IconProps } from './types';

import React from 'react';

const VideoIcon = ({
  size = 24,
  color = 'currentColor',
  ...props
}: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    fill="none"
    viewBox="0 0 48 48"
    {...props}
  >
    <path fill="#fff" fillOpacity="0.01" d="M0 0h48v48H0z"></path>
    <path
      fill="#2F88FF"
      stroke={color}
      strokeLinejoin="round"
      strokeWidth="2"
      d="M4 10a2 2 0 0 1 2-2h36a2 2 0 0 1 2 2v28a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"
    ></path>
    <path
      stroke="#fff"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="M36 8v32M12 8v32M38 18h6M38 30h6M4 18h6"
    ></path>
    <path
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="M4 16v4M9 8h6M9 40h6M33 8h6M33 40h6"
    ></path>
    <path
      stroke="#fff"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="M4 30h6"
    ></path>
    <path
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="M4 28v4M44 28v4M44 16v4"
    ></path>
    <path
      fill="#43CCF8"
      stroke="#fff"
      strokeLinejoin="round"
      strokeWidth="2"
      d="m21 19 8 5-8 5z"
    ></path>
  </svg>
);

export default VideoIcon;
