import React from 'react';
import {
  TouchableOpacity, Text, ActivityIndicator, StyleSheet, ViewStyle,
} from 'react-native';

interface ButtonProps {
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  fullWidth?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'outline';
  style?: ViewStyle;
}

export function Button({
  children, onPress, disabled, isLoading, fullWidth, size = 'md', variant = 'primary', style,
}: ButtonProps) {
  const isPrimary = variant === 'primary';

  return (
    <TouchableOpacity
      style={[
        styles.base,
        isPrimary ? styles.primary : styles.outline,
        size === 'lg' && styles.lg,
        size === 'sm' && styles.sm,
        fullWidth && styles.fullWidth,
        (disabled || isLoading) && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || isLoading}
      activeOpacity={0.7}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={isPrimary ? '#fff' : '#00D4AA'} />
      ) : (
        <Text style={[styles.text, !isPrimary && styles.outlineText]}>
          {children}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  primary: {
    backgroundColor: '#00D4AA',
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#00D4AA',
  },
  lg: { paddingVertical: 18, borderRadius: 16 },
  sm: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10 },
  fullWidth: { width: '100%' },
  disabled: { opacity: 0.5 },
  text: { fontSize: 16, fontWeight: '700', color: '#fff' },
  outlineText: { color: '#00D4AA' },
});
