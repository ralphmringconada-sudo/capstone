import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  type TextInputProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

type PasswordInputProps = TextInputProps & {
  containerStyle?: StyleProp<ViewStyle>;
};

/**
 * Purpose: Provides a reusable password field with controlled visibility.
 * How it works: 1) stores visibility state. 2) applies secure entry accordingly. 3) exposes an accessible toggle.
 * Technologies Used: React state and React Native form controls.
 * Why this implementation: Central behavior keeps sensitive input interaction consistent across account screens.
 */
export function PasswordInput({
  containerStyle,
  style,
  editable = true,
  ...props
}: PasswordInputProps) {
  /* Component state: visibility controls only local presentation and never changes the password value. */
  const [isVisible, setIsVisible] = useState(false);

  return (
    <View style={[styles.container, containerStyle]}>
      <TextInput
        {...props}
        style={[styles.input, style]}
        secureTextEntry={!isVisible}
        editable={editable}
      />
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={isVisible ? 'Hide password' : 'Show password'}
        onPress={() => setIsVisible((current) => !current)}
        style={styles.toggleButton}
        disabled={!editable}
      >
        <Text style={styles.toggleText}>{isVisible ? 'Hide' : 'Show'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    position: 'relative',
    justifyContent: 'center',
  },
  input: {
    width: '100%',
    backgroundColor: '#3f5c2b',
    color: '#ffffff',
    height: 44,
    paddingHorizontal: 16,
    paddingRight: 64,
    paddingVertical: 0,
    borderRadius: 6,
    fontSize: 16,
    fontFamily: 'Montserrat-Regular',
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  toggleButton: {
    position: 'absolute',
    right: 12,
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  toggleText: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 11,
    color: '#c2dc68',
    includeFontPadding: false,
  },
});
