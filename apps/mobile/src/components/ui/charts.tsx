import { useMemo, useState } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import { formatTime } from '@/lib/format';
import { colors, font } from '@/theme';

export interface Point {
  t: string;
  v: number;
}

function buildPath(points: { x: number; y: number }[]) {
  if (!points.length) return '';
  // Smooth curve via Catmull-Rom → cubic Bézier
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

/** Area line chart with gridlines, axis labels and tap/hover to inspect values. */
export function LineChart({
  data,
  height = 180,
  color = colors.primary,
  format = (v: number) => v.toFixed(1),
  step,
}: {
  data: Point[];
  height?: number;
  color?: string;
  format?: (v: number) => string;
  step?: boolean;
}) {
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const padL = 44;
  const padR = 12;
  const padT = 12;
  const padB = 24;

  const sorted = useMemo(() => [...data].sort((a, b) => a.t.localeCompare(b.t)), [data]);
  const { pts, min, max, ticks } = useMemo(() => {
    if (!sorted.length || !width) return { pts: [], min: 0, max: 1, ticks: [] as number[] };
    let lo = Math.min(...sorted.map((d) => d.v));
    let hi = Math.max(...sorted.map((d) => d.v));
    if (hi - lo < 1) {
      hi += 0.5;
      lo -= 0.5;
    }
    const pad = (hi - lo) * 0.12;
    lo -= pad;
    hi += pad;
    const t0 = new Date(sorted[0].t).getTime();
    const t1 = new Date(sorted[sorted.length - 1].t).getTime() || t0 + 1;
    const w = width - padL - padR;
    const h = height - padT - padB;
    const pts = sorted.map((d) => ({
      x: padL + ((new Date(d.t).getTime() - t0) / Math.max(1, t1 - t0)) * w,
      y: padT + (1 - (d.v - lo) / (hi - lo)) * h,
    }));
    const ticks = [0, 1, 2, 3].map((i) => lo + ((hi - lo) * i) / 3);
    return { pts, min: lo, max: hi, ticks };
  }, [sorted, width, height]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const inspect = (x: number) => {
    if (!pts.length) return;
    let best = 0;
    for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i].x - x) < Math.abs(pts[best].x - x)) best = i;
    setActive(best);
  };

  let line = '';
  if (step && pts.length) {
    line = `M ${pts[0].x} ${pts[0].y}` + pts.slice(1).map((p) => ` H ${p.x} V ${p.y}`).join('');
  } else {
    line = buildPath(pts);
  }
  const area = pts.length ? `${line} L ${pts[pts.length - 1].x} ${height - padB} L ${pts[0].x} ${height - padB} Z` : '';
  const a = active !== null ? pts[active] : null;
  const gradId = `g${color.replace('#', '')}`;

  return (
    <View onLayout={onLayout} style={{ height, width: '100%' }}>
      {width > 0 && pts.length > 1 ? (
        <Pressable
          style={{ flex: 1 }}
          onPressIn={(e) => inspect(e.nativeEvent.locationX)}
          onPressOut={() => setTimeout(() => setActive(null), 1600)}
          {...({ onMouseMove: (e: any) => inspect(e.nativeEvent.offsetX ?? e.nativeEvent.locationX), onMouseLeave: () => setActive(null) } as object)}
          accessibilityLabel={`Chart with ${pts.length} readings from ${format(Math.min(...sorted.map((d) => d.v)))} to ${format(Math.max(...sorted.map((d) => d.v)))}`}
        >
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0.22} />
                <Stop offset="1" stopColor={color} stopOpacity={0.01} />
              </LinearGradient>
            </Defs>
            {ticks.map((t, i) => {
              const y = padT + (1 - (t - min) / (max - min)) * (height - padT - padB);
              return (
                <G key={i}>
                  <Line x1={padL} x2={width - padR} y1={y} y2={y} stroke={colors.border} strokeDasharray="3 4" />
                  <SvgText x={padL - 8} y={y + 4} fontSize={10} fill={colors.textSubtle} textAnchor="end" fontFamily={font.medium}>
                    {format(t)}
                  </SvgText>
                </G>
              );
            })}
            {[0, Math.floor(sorted.length / 2), sorted.length - 1].map((i) => (
              <SvgText
                key={i}
                x={pts[i].x}
                y={height - 6}
                fontSize={10}
                fill={colors.textSubtle}
                textAnchor={i === 0 ? 'start' : i === sorted.length - 1 ? 'end' : 'middle'}
                fontFamily={font.medium}
              >
                {formatTime(sorted[i].t)}
              </SvgText>
            ))}
            <Path d={area} fill={`url(#${gradId})`} />
            <Path d={line} stroke={color} strokeWidth={2.25} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            {a ? (
              <>
                <Line x1={a.x} x2={a.x} y1={padT} y2={height - padB} stroke={color} strokeOpacity={0.35} />
                <Circle cx={a.x} cy={a.y} r={5} fill="#fff" stroke={color} strokeWidth={2.5} />
              </>
            ) : (
              <Circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={4} fill={color} />
            )}
          </Svg>
          {a && active !== null ? (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: Math.min(Math.max(a.x - 60, 0), width - 120),
                top: 0,
                width: 120,
                backgroundColor: colors.text,
                borderRadius: 8,
                paddingVertical: 4,
                paddingHorizontal: 8,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontFamily: font.semibold, fontSize: 12 }}>{format(sorted[active].v)}</Text>
              <Text style={{ color: '#CBD5E1', fontFamily: font.regular, fontSize: 10 }}>{formatTime(sorted[active].t)}</Text>
            </View>
          ) : null}
        </Pressable>
      ) : width > 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: font.regular, color: colors.textSubtle, fontSize: 13 }}>Not enough readings yet. Advance the simulation to collect data.</Text>
        </View>
      ) : null}
    </View>
  );
}

export function Sparkline({ data, color = colors.primary, width = 96, height = 32 }: { data: number[]; color?: string; width?: number; height?: number }) {
  if (data.length < 2) return <View style={{ width, height }} />;
  const lo = Math.min(...data);
  const hi = Math.max(...data);
  const range = hi - lo || 1;
  const pts = data.map((v, i) => ({ x: (i / (data.length - 1)) * width, y: 3 + (1 - (v - lo) / range) * (height - 6) }));
  return (
    <Svg width={width} height={height}>
      <Path d={buildPath(pts)} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" />
    </Svg>
  );
}

/** Donut gauge (used for thermostat setpoint and battery). */
export function Gauge({ value, min, max, size = 160, color = colors.primary, label, sublabel }: { value: number; min: number; max: number; size?: number; color?: string; label: string; sublabel?: string }) {
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = size / 2;
  const start = Math.PI * 0.75;
  const sweep = Math.PI * 1.5;
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const arc = (from: number, to: number) => {
    const x1 = c + r * Math.cos(from);
    const y1 = c + r * Math.sin(from);
    const x2 = c + r * Math.cos(to);
    const y2 = c + r * Math.sin(to);
    const large = to - from > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  };
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Path d={arc(start, start + sweep)} stroke={colors.surfaceAlt} strokeWidth={stroke} fill="none" strokeLinecap="round" />
        {pct > 0.005 ? <Path d={arc(start, start + sweep * pct)} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" /> : null}
      </Svg>
      <Text style={{ fontFamily: font.bold, fontSize: size * 0.2, color: colors.text, letterSpacing: -1 }}>{label}</Text>
      {sublabel ? <Text style={{ fontFamily: font.medium, fontSize: 12, color: colors.textMuted }}>{sublabel}</Text> : null}
    </View>
  );
}
