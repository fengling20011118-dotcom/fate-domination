export const MAP_ASSET = "./assets/map/map-original.png";

// 这里只定义地点语义。精确视觉坐标将在对照旧版地图后录入，原地图图像不会重绘。
export const MAP_LOCATIONS = Object.freeze({
  workshop: {
    id: "workshop",
    name: "魔术工房",
    capacity: 4,
    next: "mountain",
    moveCost: 2,
  },
  mountain: {
    id: "mountain",
    name: "深山町",
    capacity: null,
    next: "city",
    moveCost: 1,
  },
  city: {
    id: "city",
    name: "新都",
    capacity: null,
    next: "scouting",
    moveCost: 2,
  },
  scouting: {
    id: "scouting",
    name: "侦察",
    capacity: 1,
    next: null,
    moveCost: 0,
  },
});
