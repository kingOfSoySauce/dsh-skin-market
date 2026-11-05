import type { CompatibilityAdapter, DshRuntime, SkinEntry } from './types.ts';
import { type Translator } from './client/i18n.ts';
type CompatibilitySkin = Pick<SkinEntry, 'compatibility'>;
export interface CompatibilityAssessment {
    decision: 'compatible' | 'adaptable' | 'unknown' | 'incompatible';
    reason: string;
    adapterIds: string[];
}
/** Bind a one-operation acknowledgement to the package and runtime shown. */
export declare function compatibilityContext(skin: Pick<SkinEntry, 'id' | 'package' | 'install' | 'compatibility'>, runtime: DshRuntime | null): string;
export declare function applicableAdapters(skin: CompatibilitySkin, runtime: DshRuntime, _legacyIncludeBuiltIns?: boolean): CompatibilityAdapter[];
export declare function assessCompatibility(skin: CompatibilitySkin, runtime: DshRuntime, t?: Translator): CompatibilityAssessment;
export {};
