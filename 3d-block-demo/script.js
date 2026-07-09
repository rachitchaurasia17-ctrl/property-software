function createSvgElement(tag, attrs = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });
  return element;
}

function pointsToString(points) {
  return points.map(([x, y]) => `${x},${y}`).join(" ");
}

function offsetPoints(points, dx, dy) {
  return points.map(([x, y]) => [x + dx, y + dy]);
}

function getBounds(points) {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function createPremiumInsetShadow(svg, id) {
  const defs = svg.querySelector("defs") || createSvgElement("defs");
  const filter = createSvgElement("filter", {
    id: id,
    x: "-20%",
    y: "-20%",
    width: "140%",
    height: "140%",
  });

  filter.appendChild(
    createSvgElement("feOffset", {
      in: "SourceAlpha",
      dx: 4,
      dy: 6,
      result: "offsetAlpha",
    }),
  );
  filter.appendChild(
    createSvgElement("feGaussianBlur", {
      in: "offsetAlpha",
      stdDeviation: 5,
      result: "blur",
    }),
  );
  filter.appendChild(
    createSvgElement("feComposite", {
      operator: "out",
      in: "SourceAlpha",
      in2: "blur",
      result: "innerEdgeAlpha",
    }),
  );
  filter.appendChild(
    createSvgElement("feFlood", {
      "flood-color": "#5c2a00",
      "flood-opacity": 0.45,
      result: "shadowColor",
    }),
  );
  filter.appendChild(
    createSvgElement("feComposite", {
      operator: "in",
      in: "shadowColor",
      in2: "innerEdgeAlpha",
      result: "innerShadow",
    }),
  );
  filter.appendChild(
    createSvgElement("feComposite", {
      operator: "over",
      in: "innerShadow",
      in2: "SourceGraphic",
    }),
  );

  defs.appendChild(filter);
  if (!svg.querySelector("defs")) svg.appendChild(defs);
  return id;
}

function createBevelFilter(svg, id) {
  const defs = svg.querySelector("defs") || createSvgElement("defs");
  const filter = createSvgElement("filter", {
    id: id,
    x: "-20%",
    y: "-20%",
    width: "140%",
    height: "140%",
  });

  // Shadow on bottom-right to create bevel
  filter.appendChild(
    createSvgElement("feOffset", {
      in: "SourceAlpha",
      dx: 4,
      dy: 8,
      result: "off2",
    }),
  );
  filter.appendChild(
    createSvgElement("feGaussianBlur", {
      in: "off2",
      stdDeviation: 4,
      result: "blur2",
    }),
  );
  filter.appendChild(
    createSvgElement("feComposite", {
      operator: "out",
      in: "SourceAlpha",
      in2: "blur2",
      result: "edge2",
    }),
  );
  filter.appendChild(
    createSvgElement("feFlood", {
      "flood-color": "#000000",
      "flood-opacity": 0.12,
      result: "color2",
    }),
  );
  filter.appendChild(
    createSvgElement("feComposite", {
      operator: "in",
      in: "color2",
      in2: "edge2",
      result: "shad",
    }),
  );

  const merge = createSvgElement("feMerge", { result: "bevel" });
  merge.appendChild(createSvgElement("feMergeNode", { in: "shad" }));
  filter.appendChild(merge);

  filter.appendChild(
    createSvgElement("feComposite", {
      operator: "over",
      in: "bevel",
      in2: "SourceGraphic",
    }),
  );

  defs.appendChild(filter);
  return id;
}

function createGradient(svg, id, bounds, stops, yOffset = 0) {
  const defs = svg.querySelector("defs") || createSvgElement("defs");
  const gradient = createSvgElement("linearGradient", {
    id: id,
    gradientUnits: "userSpaceOnUse",
    x1: bounds.minX,
    y1: bounds.minY,
    x2: bounds.maxX,
    y2: bounds.maxY + yOffset,
  });
  stops.forEach((stop) => {
    gradient.appendChild(
      createSvgElement("stop", {
        offset: stop.offset,
        "stop-color": stop.color,
      }),
    );
  });
  defs.appendChild(gradient);
  if (!svg.querySelector("defs")) svg.appendChild(defs);
  return id;
}

function renderRaisedBlock({
  container,
  points,
  fillColor = "#ff7417",
  borderColor = "#fffaf0",
  sideColor = "#d6c4a3",
  depth = 48,
  shadow = true,
}) {
  if (!container) throw new Error("container is required.");
  if (!Array.isArray(points) || points.length < 3)
    throw new Error("points required.");

  container.innerHTML = "";
  const bounds = getBounds(points);
  const padding = 120;
  const strokeSafety = 80;

  const viewBoxX = bounds.minX - padding;
  const viewBoxY = bounds.minY - padding;
  const viewBoxWidth = bounds.maxX - bounds.minX + padding * 2 + strokeSafety;
  const viewBoxHeight =
    bounds.maxY - bounds.minY + padding * 2 + depth + strokeSafety;

  const svg = createSvgElement("svg", {
    class: "raised-block-svg",
    viewBox: `${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`,
    role: "img",
  });

  const rimThickness = 48; // Visible white rim thickness

  // Gradients
  const topGradId = `gradTop-${Math.random().toString(36).slice(2)}`;
  createGradient(svg, topGradId, bounds, [
    { offset: "0%", color: "#ff9c45" }, // bright premium orange
    { offset: "100%", color: "#f26500" }, // deep rich orange
  ]);

  const sideGradId = `gradSide-${Math.random().toString(36).slice(2)}`;
  createGradient(
    svg,
    sideGradId,
    bounds,
    [
      { offset: "0%", color: "#ffffff" },
      { offset: "40%", color: "#f7f1e6" },
      { offset: "100%", color: "#d2c3aa" },
    ],
    depth,
  );

  const innerWallGradId = `innerWallGrad-${Math.random().toString(36).slice(2)}`;
  createGradient(svg, innerWallGradId, bounds, [
    { offset: "0%", color: "#9e968a" }, // shadow on top-left
    { offset: "100%", color: "#ffffff" }, // bright on bottom-right
  ]);

  const insetShadowId = `insetShadow-${Math.random().toString(36).slice(2)}`;
  createPremiumInsetShadow(svg, insetShadowId);

  const bevelId = `bevel-${Math.random().toString(36).slice(2)}`;
  createBevelFilter(svg, bevelId);

  const topStr = pointsToString(points);
  const bottomStr = pointsToString(offsetPoints(points, 0, depth));

  // 1. Shadow
  if (shadow) {
    svg.appendChild(
      createSvgElement("polygon", {
        points: bottomStr,
        fill: "rgba(0,0,0,0.22)",
        stroke: "rgba(0,0,0,0.22)",
        "stroke-width": rimThickness,
        "stroke-linejoin": "round",
        style: "filter: blur(16px); transform: translate(6px, 24px);",
      }),
    );
  }

  // 2. Side walls (Extrusion)
  const sidesGroup = createSvgElement("g", { class: "raised-block-sides" });

  // Bottom rounded base
  sidesGroup.appendChild(
    createSvgElement("polygon", {
      points: bottomStr,
      fill: `url(#${sideGradId})`,
      stroke: `url(#${sideGradId})`,
      "stroke-width": rimThickness,
      "stroke-linejoin": "round",
    }),
  );

  // Side quads
  for (let i = 0; i < points.length; i++) {
    const curr = points[i],
      nxt = points[(i + 1) % points.length];
    const quad = [
      curr,
      nxt,
      [nxt[0], nxt[1] + depth],
      [curr[0], curr[1] + depth],
    ];
    sidesGroup.appendChild(
      createSvgElement("polygon", {
        points: pointsToString(quad),
        fill: `url(#${sideGradId})`,
        stroke: `url(#${sideGradId})`,
        "stroke-width": rimThickness,
        "stroke-linejoin": "round",
      }),
    );
  }
  svg.appendChild(sidesGroup);

  // 3. Top Border (Solid White Blob)
  // This is drawn as a solid shape covering everything.
  // We will clip the inside out in the next step to reveal the physical hole.
  const topBorderPolygon = createSvgElement("polygon", {
    points: topStr,
    fill: "#ffffff",
    stroke: "#ffffff",
    "stroke-width": rimThickness,
    "stroke-linejoin": "round",
    filter: `url(#${bevelId})`, // Adds a pillowy bevel to the white rim
  });
  svg.appendChild(topBorderPolygon);

  // 4. Physical Inner Hole & Recessed Floor
  const innerDepth = 18; // Deeper recess for dramatic bird's eye view 3D effect

  const holeClipId = `holeClip-${Math.random().toString(36).slice(2)}`;
  const defs = svg.querySelector("defs") || createSvgElement("defs");
  const clipPath = createSvgElement("clipPath", { id: holeClipId });
  clipPath.appendChild(createSvgElement("polygon", { points: topStr }));
  defs.appendChild(clipPath);

  const innerHoleGroup = createSvgElement("g", {
    "clip-path": `url(#${holeClipId})`,
  });

  // Inner walls (Quads going from Z=0 to Z=innerDepth)
  for (let i = 0; i < points.length; i++) {
    const curr = points[i],
      nxt = points[(i + 1) % points.length];
    const quad = [
      curr,
      nxt,
      [nxt[0], nxt[1] + innerDepth],
      [curr[0], curr[1] + innerDepth],
    ];
    innerHoleGroup.appendChild(
      createSvgElement("polygon", {
        points: pointsToString(quad),
        fill: `url(#${innerWallGradId})`,
        stroke: `url(#${innerWallGradId})`,
        "stroke-width": 2, // Slight stroke to cover anti-aliasing gaps seamlessly
        "stroke-linejoin": "round",
      }),
    );
  }

  // Recessed Colored Floor (Z=innerDepth)
  const floorStr = pointsToString(offsetPoints(points, 0, innerDepth));
  const floorPolygon = createSvgElement("polygon", {
    points: floorStr,
    fill: `url(#${topGradId})`,
    filter: `url(#${insetShadowId})`, // Adds ambient occlusion shadow where floor meets inner walls
  });

  innerHoleGroup.appendChild(floorPolygon);
  svg.appendChild(innerHoleGroup);

  container.appendChild(svg);
}

const demoPoints = [
  [150, 155],
  [240, 115],
  [410, 132],
  [580, 110],
  [720, 150],
  [760, 245],
  [735, 340],
  [625, 365],
  [560, 335],
  [455, 390],
  [315, 370],
  [250, 320],
  [155, 305],
  [115, 235],
];

renderRaisedBlock({
  container: document.getElementById("blockPreview"),
  points: demoPoints,
  fillColor: "#ff7417",
  borderColor: "#fffaf0",
  sideColor: "#d6c4a3",
  depth: 48,
  shadow: true,
});
