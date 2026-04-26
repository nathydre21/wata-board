import React from 'react';

export interface AccessibleImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  alt: string; // Makes the alt attribute strictly required for screen readers
}

export const AccessibleImage: React.FC<AccessibleImageProps> = ({ alt, ...props }) => {
  return (
    <img alt={alt} {...props} />
  );
};