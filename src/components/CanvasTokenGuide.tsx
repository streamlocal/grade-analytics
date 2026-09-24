import tokenGuideGif from '../assets/canvas-token-guide.gif';

export const CANVAS_SETTINGS_URL = 'https://saintignatius.instructure.com/profile/settings';

export default function CanvasTokenGuide() {
  return <section className="canvas-token-guide" aria-labelledby="canvas-token-guide-title">
    <div className="canvas-token-guide-heading">
      <div><span className="settings-kicker">Canvas setup</span><h3 id="canvas-token-guide-title">How to get your API token</h3></div>
      <a className="btn" href={CANVAS_SETTINGS_URL} target="_blank" rel="noopener noreferrer">Open Canvas Settings ↗</a>
    </div>
    <ol>
      <li>Sign in to Canvas and open your <a href={CANVAS_SETTINGS_URL} target="_blank" rel="noopener noreferrer">Profile Settings</a>.</li>
      <li>Scroll to <strong>Approved Integrations</strong> and select <strong>New Access Token</strong>.</li>
      <li>Enter a purpose, then choose the latest expiration date your school allows.</li>
      <li>Generate the token, copy it immediately, and paste it into the field above. Canvas shows it only once.</li>
    </ol>
    <figure>
      <img src={tokenGuideGif} alt="Animated walkthrough: scroll through Canvas User Settings to Approved Integrations, click New Access Token, choose the latest allowed expiration, then copy the generated token." loading="lazy" />
      <figcaption>Illustration based on the supplied Canvas settings page. Account details and token values are omitted.</figcaption>
    </figure>
  </section>;
}
