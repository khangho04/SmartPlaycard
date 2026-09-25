import { NavigationBar } from 'expo-navigation-bar';
import { useEffect } from 'react';
import { Platform, StatusBar } from 'react-native';

export function ImmersiveController() {
  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    StatusBar.setHidden(true, 'fade');
    NavigationBar.setHidden(true);
    NavigationBar.setStyle('dark');
  }, []);

  return <NavigationBar hidden style="dark" />;
}
