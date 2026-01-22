export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;

  /**
   * Requests Mic permission and starts recording
   */
  async start() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(this.stream);
      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.start();
    } catch (e) {
      console.error("Microphone access denied or error:", e);
      throw new Error("Mic Access Denied");
    }
  }

  /**
   * Stops recording and returns the Base64 encoded audio string
   */
  async stop(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) return resolve("");

      this.mediaRecorder.onstop = () => {
        // Combine chunks into a single Blob (audio/webm is standard for modern web)
        const audioBlob = new Blob(this.audioChunks, { type: "audio/webm" });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          if (reader.result) {
            // Remove "data:audio/webm;base64," prefix
            const base64 = (reader.result as string).split(",")[1];
            resolve(base64);
          } else {
            reject("Failed to encode audio");
          }
        };
      };

      this.mediaRecorder.stop();
      // Stop all tracks to release the microphone (turn off the red dot)
      if (this.stream) {
        this.stream.getTracks().forEach((track) => track.stop());
        this.stream = null;
      }
    });
  }
}
