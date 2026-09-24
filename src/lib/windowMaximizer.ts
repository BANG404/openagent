import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";

export interface WindowGeometry {
  position: { x: number; y: number };
  size: { width: number; height: number };
}

export interface WindowMaximizerTarget {
  isMaximized: () => Promise<boolean>;
  maximize: () => Promise<void>;
  unmaximize: () => Promise<void>;
  innerSize: () => Promise<{ width: number; height: number }>;
  outerPosition: () => Promise<{ x: number; y: number }>;
  setSize: (size: PhysicalSize) => Promise<void>;
  setPosition: (position: PhysicalPosition) => Promise<void>;
}

export function createWindowMaximizer(target: WindowMaximizerTarget) {
  let normalGeometry: WindowGeometry | null = null;
  let pendingToggle: Promise<void> | null = null;
  let transitioning = false;
  let rememberRevision = 0;

  async function rememberNormalGeometry(): Promise<void> {
    if (transitioning) return;
    const revision = ++rememberRevision;
    if (await target.isMaximized()) return;
    const [position, size] = await Promise.all([target.outerPosition(), target.innerSize()]);
    if (transitioning || revision !== rememberRevision) return;
    normalGeometry = {
      position: { x: position.x, y: position.y },
      size: { width: size.width, height: size.height },
    };
  }

  async function restoreNormalGeometry(): Promise<void> {
    if (!normalGeometry) return;
    await target.setSize(new PhysicalSize(normalGeometry.size.width, normalGeometry.size.height));
    await target.setPosition(
      new PhysicalPosition(normalGeometry.position.x, normalGeometry.position.y),
    );
  }

  async function toggle(): Promise<void> {
    if (pendingToggle) return pendingToggle;

    pendingToggle = (async () => {
      if (await target.isMaximized()) {
        transitioning = true;
        try {
          await target.unmaximize();
          await restoreNormalGeometry();
        } finally {
          transitioning = false;
        }
      } else {
        await rememberNormalGeometry();
        transitioning = true;
        try {
          await target.maximize();
        } finally {
          transitioning = false;
        }
      }
    })();

    try {
      await pendingToggle;
    } finally {
      pendingToggle = null;
    }
  }

  return { rememberNormalGeometry, toggle };
}
