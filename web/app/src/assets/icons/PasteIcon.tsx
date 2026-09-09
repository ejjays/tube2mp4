import { IconProps } from './types';

import React from 'react';

const PasteIcon = ({ size = 24, ...props }: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    xmlSpace="preserve"
    id="Layer_1"
    version="1.1"
    width={size}
    height={size}
    viewBox="0 0 512 512"
    {...props}
  >
    <path
      fill="#FFA733"
      d="M478.609 133.565v-33.391h-33.392V66.783H333.913V0H0v445.216h178.087V512H512V133.565z"
    ></path>
    <path
      fill="#46F8FF"
      d="M478.609 133.565v-33.391h-33.392V66.783l-267.13-.002V512H512V133.565z"
    ></path>
    <path fill="#9BFBFF" d="M178.087 66.781h166.957v445.217H178.087z"></path>
    <path
      fill="#00D7DF"
      d="M478.609 133.565v-33.391h-33.392V66.783h-66.782v133.565H512v-66.783z"
    ></path>
    <path fill="#FFDA44" d="M77.913 0H256v100.174H77.913z"></path>
    <path d="M478.609 133.565v33.391h-66.783v-66.783h33.391v33.391h33.392v-33.391h-33.391v-33.39H333.913V0H0v445.217h178.087V512H512V133.566h-33.391zM300.522 33.391v33.391H256V33.391zm-77.913 0v33.391H111.304V33.391zM33.391 411.826V33.391h44.522v66.782h100.174v311.652H33.391zm445.218 66.783h-267.13V100.174h166.956v100.174h100.174z"></path>
  </svg>
);

export default PasteIcon;
