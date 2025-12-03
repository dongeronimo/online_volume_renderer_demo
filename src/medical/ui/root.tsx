import { ErrorOverlay } from "./error_overlay";
import { PipelineSwitcher } from "./pipeline_switcher";
import { ProgressBar } from "./progress_bar";
import { RendererProvider } from "./renderer_provider";
import { Toolbar } from "./toolbar";
import { LassoControlsPanel } from "./lassoControlsPanel";
import { FloatingPanel } from "../../editor/components/floatingPanel";



export const Root = () => {
  return (
    <RendererProvider>
      {/* <RenderSettingsPanel />
      <QualitySettingsPanel /> */}
      <FloatingPanel title='Lasso Tools' initialX={10} initialY={10} width={220} height={180}>
        <LassoControlsPanel />
      </FloatingPanel>
      <PipelineSwitcher />
      <Toolbar/>
      <ProgressBar/>
      <ErrorOverlay/>
    </RendererProvider>
  );
};