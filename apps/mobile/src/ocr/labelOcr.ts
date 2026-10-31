import { requireOptionalNativeModule } from 'expo';
import type { OcrBox } from '@nutrichef/shared';

// The local module in modules/label-ocr. Absent in Expo Go, where the label
// scanner falls back to the vision model.
const native = requireOptionalNativeModule<{ recognize(uri: string): Promise<OcrBox[]> }>('LabelOcr');

/** On-device OCR of a local image, or null when this build has no module. */
export const recognizeText: ((uri: string) => Promise<OcrBox[]>) | null = native
  ? (uri) => native.recognize(uri)
  : null;
