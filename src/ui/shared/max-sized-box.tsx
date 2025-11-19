import React from 'react';
import { Box } from 'ink';

interface MaxSizedBoxProps {
  maxHeight?: number;
  maxWidth?: number;
  children: React.ReactNode;
}

export const MaxSizedBox: React.FC<MaxSizedBoxProps> = ({
  maxHeight: _maxHeight,
  maxWidth: _maxWidth,
  children,
  ...props
}) => {
  return (
    <Box 
      flexDirection="column"
      {...props}
    >
      {children}
    </Box>
  );
};