import React from 'react';
import { Box } from 'ink';

interface MaxSizedBoxProps {
  children: React.ReactNode;
  [key: string]: unknown;
}

export const MaxSizedBox: React.FC<MaxSizedBoxProps> = ({
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