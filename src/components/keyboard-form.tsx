import { useEffect, useRef, type ReactNode } from 'react';
import {
  Keyboard, KeyboardAvoidingView, Platform, ScrollView, TextInput,
  type ScrollViewInstance, type ScrollViewProps, type StyleProp, type ViewStyle,
} from 'react-native';

/** Resize the form viewport, including forms hosted in a native Modal. */
export function KeyboardForm({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <KeyboardAvoidingView
    enabled={Platform.OS !== 'web'}
    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    style={[{ flex: 1, alignSelf: 'stretch' }, style]}>
    {children}
  </KeyboardAvoidingView>;
}

/** Keep the focused input visible after keyboard/layout changes and between fields. */
export function FormScrollView({ onFocus, onBlur, onLayout, onScroll, ...props }: ScrollViewProps) {
  const scroll = useRef<ScrollViewInstance>(null);
  const offset = useRef(0);
  const focused = useRef<ReturnType<typeof TextInput.State.currentlyFocusedInput> | null>(null);
  const frame = useRef<number | null>(null);
  const revealInput = () => {
    if (Platform.OS === 'web') return;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const input = focused.current;
      if (input && Keyboard.isVisible() && input === TextInput.State.currentlyFocusedInput()) {
        // Window coordinates also work for centered modals and forms below a header.
        scroll.current?.getNativeScrollRef()?.measureInWindow((_x, top, _width, height) => {
          input.measureInWindow((_inputX, inputTop, _inputWidth, inputHeight) => {
            if (input !== focused.current || !Keyboard.isVisible()) return;
            const bottom = Math.min(top + height, Keyboard.metrics()?.screenY ?? top + height) - 24;
            const delta = inputTop + inputHeight > bottom
              ? inputTop + inputHeight - bottom
              : inputTop < top + 12 ? inputTop - top - 12 : 0;
            if (delta !== 0) scroll.current?.scrollTo({ y: Math.max(0, offset.current + delta), animated: true });
          });
        });
      }
    });
  };
  useEffect(() => {
    const subscription = Keyboard.addListener('keyboardDidShow', revealInput);
    const pendingFrame = frame;
    return () => {
      subscription.remove();
      if (pendingFrame.current !== null) cancelAnimationFrame(pendingFrame.current);
    };
  }, []);
  return <ScrollView
    {...props}
    ref={scroll}
    keyboardShouldPersistTaps="handled"
    keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
    onFocus={event => { if (Platform.OS !== 'web') focused.current = TextInput.State.currentlyFocusedInput(); revealInput(); onFocus?.(event); }}
    onBlur={event => { focused.current = null; onBlur?.(event); }}
    onLayout={event => { revealInput(); onLayout?.(event); }}
    scrollEventThrottle={16}
    onScroll={event => { offset.current = event.nativeEvent.contentOffset.y; onScroll?.(event); }}
  />;
}
