import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { svgPathProperties } from 'svg-path-properties';
import { LOGO_SILHOUETTE_PATH, LOGO_VIEWBOX } from '@/assets/ecobantayVectorLogo';

const AnimatedPath = Animated.createAnimatedComponent(Path);

// react-native-svg doesn't support the `pathLength` normalization attribute (unlike web
// SVG), so strokeDasharray/strokeDashoffset must be sized in the path's *real* length
// units. Computed once at module load since the path data is static.
const SILHOUETTE_LENGTH = new svgPathProperties(LOGO_SILHOUETTE_PATH).getTotalLength();

// Tuning knobs — all expressed in the source SVG's 768-unit coordinate space, so they
// scale automatically with whatever `size` prop the caller passes in.
const LINE_COLOR = '#105b0b';
const LINE_WIDTH = 66;
const LINE_LENGTH_FRACTION = 0.22; // the visible segment covers ~22% of the outline
const LAP_DURATION_MS = 1700;

// Second line: not a true constant-distance offset (SVG/react-native-svg has no built-in path
// offset operation) — just the same outline scaled up around the icon's center. Approximates a
// parallel line well on a rounded shape like this one; the gap will vary slightly around any
// sharper curves since scaling isn't geometrically identical to offsetting.
const PARALLEL_SCALE = 1.04;
const VIEWBOX_CENTER = 384; // LOGO_VIEWBOX is '0 0 768 768'

// dash + gap adds up to exactly one full path traversal, so the pattern's phase at the end
// of a lap (offset = -SILHOUETTE_LENGTH) matches its phase at the start (offset = 0) exactly.
// That's what makes Animated.loop's reset seamless.
const dashLength = SILHOUETTE_LENGTH * LINE_LENGTH_FRACTION;
const gapLength = SILHOUETTE_LENGTH - dashLength;
const DASH_ARRAY = `${dashLength} ${gapLength}`;

/**
 * Purpose: Renders one or two thick dark-green lines continuously tracing the EcoBantay leaf mark's
 * own outline, at whatever pixel size the caller needs — the small top-bar badge or a full loading screen.
 * How it works: animates one strokeDashoffset value on a loop; when `lines` is 2, a second line reads
 * the same value phase-shifted by half a lap so its visible segment sits on the opposite side of the shape.
 * Technologies Used: React Native Animated (JS-driven, since SVG stroke props aren't native-drivable),
 * react-native-svg, and svg-path-properties (to size the dash pattern in real path-length units).
 */
export default function AnimatedTracedLogo({ size, lines = 2 }: { size: number; lines?: 1 | 2 }) {
  const dashOffset = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Runs for the component's whole lifetime, independent of any fade-in/out the
    // caller applies around it — stopping this loop on hide would freeze the trace
    // mid-motion for the duration of a fade, rather than always animating under it.
    dashOffset.setValue(0);
    const loop = Animated.loop(
      Animated.timing(dashOffset, {
        toValue: -SILHOUETTE_LENGTH,
        duration: LAP_DURATION_MS,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [dashOffset]);

  const dashOffsetOpposite = dashOffset.interpolate({
    inputRange: [-SILHOUETTE_LENGTH, 0],
    outputRange: [-SILHOUETTE_LENGTH * 1.5, -SILHOUETTE_LENGTH * 0.5],
  });

  return (
    <Svg width={size} height={size} viewBox={LOGO_VIEWBOX}>
      <AnimatedPath
        d={LOGO_SILHOUETTE_PATH}
        fill="none"
        stroke={LINE_COLOR}
        strokeWidth={LINE_WIDTH}
        strokeLinecap="round"
        strokeDasharray={DASH_ARRAY}
        strokeDashoffset={dashOffset}
      />
      {lines === 2 ? (
        <G
          transform={`translate(${VIEWBOX_CENTER} ${VIEWBOX_CENTER}) scale(${PARALLEL_SCALE}) translate(${-VIEWBOX_CENTER} ${-VIEWBOX_CENTER})`}
        >
          <AnimatedPath
            d={LOGO_SILHOUETTE_PATH}
            fill="none"
            stroke={LINE_COLOR}
            strokeWidth={LINE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={DASH_ARRAY}
            strokeDashoffset={dashOffsetOpposite}
          />
        </G>
      ) : null}
    </Svg>
  );
}