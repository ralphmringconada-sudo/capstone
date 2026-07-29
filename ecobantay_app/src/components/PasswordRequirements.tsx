import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getPasswordRequirements } from '@/utils/validation';

type PasswordRequirementsProps = {
  password: string;
  confirmPassword?: string;
};

/**
 * Purpose: Displays live password-rule and confirmation feedback.
 * How it works: 1) evaluates shared rules. 2) checks confirmation when provided. 3) renders met and unmet states.
 * Technologies Used: React, React Native, shared TypeScript validation.
 * Why this implementation: Visual feedback helps users satisfy the same rules enforced during submission.
 */
export function PasswordRequirements({ password, confirmPassword }: PasswordRequirementsProps) {
  const requirements = getPasswordRequirements(password);
  const passwordsMatch =
    confirmPassword !== undefined &&
    confirmPassword.length > 0 &&
    password === confirmPassword;

  return (
    <View style={styles.container}>
      {requirements.map((requirement) => (
        <View key={requirement.key} style={styles.row}>
          <Text style={[styles.icon, requirement.met && styles.iconMet]}>
            {requirement.met ? '✓' : '○'}
          </Text>
          <Text style={[styles.label, requirement.met && styles.labelMet]}>
            {requirement.label}
          </Text>
        </View>
      ))}

      {confirmPassword !== undefined ? (
        <View style={styles.row}>
          <Text style={[styles.icon, passwordsMatch && styles.iconMet]}>
            {passwordsMatch ? '✓' : '○'}
          </Text>
          <Text style={[styles.label, passwordsMatch && styles.labelMet]}>
            Passwords match
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginTop: 8,
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    width: 18,
    fontFamily: 'Montserrat-Bold',
    fontSize: 12,
    color: '#d9e8c4',
    includeFontPadding: false,
  },
  iconMet: {
    color: '#ffffff',
  },
  label: {
    fontFamily: 'Montserrat-Regular',
    fontSize: 11,
    color: '#d9e8c4',
    includeFontPadding: false,
  },
  labelMet: {
    color: '#ffffff',
  },
});
