import { Composition } from "remotion";
import { SaladTax } from "./SaladTax";
import { TOTAL } from "./timeline";

export const Root = () => (
  <Composition
    id="SaladTax"
    component={SaladTax}
    durationInFrames={TOTAL}
    fps={30}
    width={1080}
    height={1920}
  />
);
