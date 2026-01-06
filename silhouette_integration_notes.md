# Body Silhouette Integration Notes

## Files
- `body_silhouette_front.svg` - Front view
- `body_silhouette_back.svg` - Back view

## ViewBox & Coordinate System
Both files use: `viewBox="0 0 1000 2000"`

- **Width**: 1000 units
- **Height**: 2000 units
- **Center axis**: x = 500 (body is horizontally centered)

---

## Recommended Styling

### Stroke
- **Color**: `#9CA3AF` (neutral gray)
- **Opacity**: 100% (built into color)
- **Width**: 4px
- **Caps/Joins**: `round`

### Fill
- **Color**: `rgba(156, 163, 175, 0.1)` (very light gray, 10% opacity)
- **Purpose**: Subtle fill helps define the body area without being distracting

### For Neumorphic/Light UI
```css
.silhouette {
  fill: rgba(156, 163, 175, 0.08);
  stroke: #B0B8C4;
  stroke-width: 3;
}
```

### For Dark Mode
```css
.silhouette {
  fill: rgba(255, 255, 255, 0.05);
  stroke: rgba(255, 255, 255, 0.3);
  stroke-width: 4;
}
```

---

## Key Anchor Landmarks (Y-coordinates)

Use these Y values to align your tappable overlay regions:

| Landmark | Y Position | Notes |
|----------|------------|-------|
| Top of head | 62 | Ellipse top edge |
| Head center | 150 | For head-related overlays |
| Bottom of head | 238 | Head ellipse bottom |
| Neck | 235–320 | Neck region |
| Shoulders | 340 | Shoulder line |
| Upper chest | 400 | Below clavicle |
| Mid torso | 550 | Chest/upper abdomen |
| Waist | 720 | Narrowest point |
| Hips | 820 | Hip line |
| Upper thigh start | 920 | Below hip crease |
| Crotch/leg split | 1000 | Where legs separate |
| Mid thigh | 1200 | Center of thigh region |
| Knee | 1400 | Approximate knee level |
| Mid calf | 1600 | Lower leg |
| Ankle | 1800 | Ankle level |
| Feet | 1920 | Bottom of figure |

---

## Key Anchor Landmarks (X-coordinates)

| Landmark | X Position | Notes |
|----------|------------|-------|
| Body center | 500 | Vertical centerline |
| Left arm outer | 215–265 | Leftmost arm edge |
| Left torso edge | 375–390 | Left side of torso |
| Right torso edge | 610–625 | Right side of torso |
| Right arm outer | 735–785 | Rightmost arm edge |
| Left leg center | 420 | Center of left leg |
| Right leg center | 580 | Center of right leg |
| Leg inner gap | 485–515 | Gap between legs |

---

## Overlay Region Suggestions

### Abdomen Zones (Front)
```
Left Abdomen:  x: 390–500, y: 550–750
Right Abdomen: x: 500–610, y: 550–750
Lower Abdomen: x: 420–580, y: 750–900
```

### Thigh Zones (Front)
```
Left Thigh:  x: 365–485, y: 1000–1350
Right Thigh: x: 515–635, y: 1000–1350
```

### Arm Zones
```
Left Arm:  x: 210–390, y: 400–900
Right Arm: x: 610–790, y: 400–900
```

### Back Zones
```
Upper Back:     x: 380–620, y: 350–550
Lower Back:     x: 400–600, y: 600–800
Left Buttock:   x: 380–500, y: 850–1000
Right Buttock:  x: 500–620, y: 850–1000
```

---

## iOS Integration Tips

1. **SwiftUI**: Load SVG as a `Shape` or use `SVGView` from a library
2. **Scaling**: Use `.aspectRatio(contentMode: .fit)` to maintain proportions
3. **Hit testing**: Create invisible overlay shapes matching the zones above
4. **Accessibility**: Add accessibility labels to each tappable region

---

## Design Notes

- **Proportions**: ~7.5 head lengths total (realistic adult proportions)
- **Gender-neutral**: Balanced shoulder/hip ratio, no gender-specific features
- **Medical-appropriate**: Clean, professional appearance suitable for health apps
- **Arms position**: Slightly away from body to allow arm site visibility
- **Leg gap**: Small gap (30 units) allows clear left/right thigh distinction
