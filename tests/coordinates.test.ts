import { cssRectToImageRect, cssToImagePoint, imageToCssPoint } from '../src/modules/selection/coordinates';

describe('coordinate mapping', () => {
  const metrics = { viewportWidth: 1200, viewportHeight: 800, imageWidth: 3000, imageHeight: 2000, dpr: 2.5, scrollX: 0, scrollY: 640 };

  it('maps CSS points to actual screenshot pixels and back', () => {
    const imagePoint = cssToImagePoint({ x: 240, y: 160 }, metrics);
    expect(imagePoint).toEqual({ x: 600, y: 400 });
    expect(imageToCssPoint(imagePoint, metrics)).toEqual({ x: 240, y: 160 });
  });

  it('does not assume DPR is the screenshot scale', () => {
    const zoomed = { ...metrics, imageWidth: 2700, imageHeight: 1800, dpr: 2 };
    expect(cssToImagePoint({ x: 600, y: 400 }, zoomed)).toEqual({ x: 1350, y: 900 });
  });

  it('clips selection rectangles to the visible viewport', () => {
    expect(cssRectToImageRect({ x: -10, y: 100, width: 500, height: 900 }, metrics)).toEqual({ x: 0, y: 250, width: 1225, height: 1750 });
  });
});
