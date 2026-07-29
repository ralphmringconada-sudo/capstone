import EventsScreen from "../screens/EventsScreen";

/**
 * Purpose: Defines the route reserved for environmental event administration.
 * How it works:
 * 1. Expo Router resolves this component for the events path.
 * 2. The component delegates the page presentation to EventsScreen.
 * Technologies Used: React and Expo Router file-based routing.
 * Why this implementation: The route can remain stable as the event workflow evolves.
 */
export default function Events() {
  return <EventsScreen />;
}