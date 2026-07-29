import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import { Montserrat_700Bold } from "@expo-google-fonts/montserrat";
import { AdminAuthProvider } from "@/context/AdminAuthContext";
import { AdminRouteGuard } from "@/components/AdminRouteGuard";

/**
 * Purpose: Establishes application-wide fonts, authentication context, and route protection.
 * How it works:
 * 1. The Montserrat font is loaded before any route is rendered.
 * 2. AdminAuthProvider exposes the authenticated administrator session.
 * 3. AdminRouteGuard evaluates access before the Expo Router stack displays a screen.
 * Technologies Used: React, Expo Router, Expo Font, and React Context.
 * Why this implementation: Central composition gives every route one consistent security and UI foundation.
 */
export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Montserrat_700Bold,
  });

  if (!fontsLoaded) return null;

  return (
    <AdminAuthProvider>
      <AdminRouteGuard>
        <Stack
          screenOptions={{
            headerShown: false,
          }}
        />
      </AdminRouteGuard>
    </AdminAuthProvider>
  );
}
