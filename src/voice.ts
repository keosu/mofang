export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function stopSpeech(): void {
  if (!canSpeak()) return;
  window.speechSynthesis.cancel();
}

export function speak(text: string): void {
  if (!canSpeak()) return;
  const synth = window.speechSynthesis;
  const line = text.trim();
  if (!line) return;
  synth.cancel();
  const utter = new SpeechSynthesisUtterance(line);
  utter.lang = 'zh-CN';
  utter.rate = 0.95;
  const voice = synth.getVoices().find((item) => item.lang.toLowerCase().startsWith('zh'));
  if (voice) utter.voice = voice;
  synth.resume();
  synth.speak(utter);
}
