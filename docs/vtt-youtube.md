# YouTube campaign playback

Release 2.0.0-alpha.11, Sites experimental beta only.

Audio accepts individual YouTube video links alongside existing uploaded/direct audio. Paste a watch, youtu.be, Shorts, mobile or live video link, give it a title and add it to the playlist. Select Enable audio on each device. DM playback opens a visible embedded player beside the map; some browsers require another tap inside the video.

The implementation uses the official IFrame Player API and the existing playlist URL, status, startedAt, position, volume and loop fields. Resource snapshots and permissions remain unchanged. Clients validate hostnames and 11-character IDs and normalize accepted links to a canonical HTTPS watch URL. Playlist/channel links are not supported.

The player is at least 200px high, keeps native controls/branding, supplies the site origin and strict-origin-when-cross-origin referrer policy, and loads the API only when YouTube playback is enabled. It does not extract/download media or run a hidden audio-only embed. Page visibility and native modal changes pause playback locally; returning rejoins the shared clock. Closing the player disables YouTube listening on that device. The controls button opens the Audio tab, pausing video while the modal obscures it.

DM play/pause/stop/next/loop use existing campaign persistence. Clients correct drift against the shared clock, with a 2.5-second tolerance. Synchronization is best effort: ads, buffering, browser restrictions and mobile background behavior can differ per listener. Native player controls affect the local player; DM shared controls live in Audio. Crossfade and SFX remain available for audio files, not YouTube videos. Other streaming service page URLs remain unsupported.

References reviewed:
- https://developers.google.com/youtube/iframe_api_reference
- https://developers.google.com/youtube/terms/required-minimum-functionality

Validation: run tests/vtt-youtube.cjs with linkedom available, plus vtt-resources, vtt-picture-upload, vtt-resource-import and vtt-cloud-repository. Tests cover URL spoofing rejection, official visible embed parameters, shared-clock commands, autoplay failure, embed errors, loop/end callbacks, volume, modal suspension and stale-player cleanup. Actual DOM tests verify playlist URL normalization and no YouTube SFX action. The real player loaded metadata and accepted Pause in browser QA; the video remained buffering. Audible playback, multi-device playback and physical iOS are unverified.


## Separate player window — alpha.12

While a YouTube track is selected, Audio offers Open separate player; the inline video also offers Separate player. This user-initiated action opens `/vtt/youtube-window.html` in a resizable desktop pop-up. Allow pop-ups if blocked. Keep that window visible while opening tabletop settings or changing tabs in the main browser window. The YouTube player itself retains visibility-based pause behavior; this does not implement hidden background YouTube playback. Mobile browsers may create a tab instead and suspend it when it is hidden.

The opener sends playback snapshots through postMessage with its exact origin and a random window nonce. The child validates the opener, origin, nonce and fields, maintains its own clock and sends duration/end/control events back. No auth/session tokens are transferred. The main page does not pause the child on dialogs or visibility changes. A closed tabletop stops the child; a three-minute stale connection stops playback. A closed child disables local listening. Master shared playback and personal volume remain controlled by the existing resource module.

`tests/vtt-youtube-popout.cjs` verifies window creation/reuse/blocking/closure, main-page dialog/visibility isolation, volume/end callbacks, strict message boundaries and clock recovery. Browser QA successfully opened/connected the window and showed advancing video captions while parent settings were open. Physical iOS and multi-device audible playback remain unverified.

Reference: https://developers.google.com/youtube/terms/developer-policies (section III.I.9).
