import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

type AuthButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'google';
  style?: StyleProp<ViewStyle>;
  left?: React.ReactNode;
};

/**
 * Purpose: Renders a pressable auth action without native shadow libraries.
 * How it works: 1) applies brand styles. 2) shows a spinner while busy. 3) disables duplicate taps.
 * Technologies Used: React Native TouchableOpacity.
 * Why this implementation: Avoids react-native-shadow-2 crashes on some Android release builds.
 */
export function AuthButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary',
  style,
  left,
}: AuthButtonProps) {
  const isGoogle = variant === 'google';

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.base,
        isGoogle ? styles.google : styles.primary,
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isGoogle ? '#000000' : '#ffffff'} />
      ) : (
        <>
          {left}
          <Text
            style={[styles.label, isGoogle && styles.googleLabel]}
            numberOfLines={1}
            allowFontScaling={false}
          >
            {label}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    width: '100%',
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 2 },
  },
  primary: {
    backgroundColor: '#3B703C',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 2,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 10,
  },
  google: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    width: undefined,
    alignSelf: 'center',
    paddingHorizontal: 20,
  },
  disabled: {
    opacity: 0.6,
  },
  label: {
    fontFamily: 'Montserrat-Semi-Bold',
    color: '#ffffff',
    fontSize: 17,
    lineHeight: 24,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  googleLabel: {
    color: '#202124',
    fontSize: 14,
    marginLeft: 8,
  },
});
