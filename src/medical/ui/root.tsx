import { ErrorOverlay } from "./error_overlay";
import { PipelineSwitcher } from "./pipeline_switcher";
import { ProgressBar } from "./progress_bar";
import { RendererProvider } from "./renderer_provider";



export const Root = () => {
  return (
    <RendererProvider>
      {/* <RenderSettingsPanel />
      <QualitySettingsPanel /> */}
      <PipelineSwitcher />
      <ProgressBar/>
      <ErrorOverlay/>
    </RendererProvider>
  );
};