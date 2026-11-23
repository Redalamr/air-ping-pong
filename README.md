# Air Ping Pong: phone as the racket

The laptop runs the game. Your phone's gyroscope gives the racket angle and swing. The webcam follows your hand to move the racket left and right along your end of the table, and your thumb on the phone is the backup.

## Run

Needs Node 18 or newer, with the phone and laptop on the same Wi-Fi.

```
npm install
npm start
```

1. On the laptop, open `https://localhost:8443` and accept the certificate warning.
2. Scan the QR code with the phone. Open it in **Chrome** and accept the warning (Advanced, then Proceed).
3. Tap **Start**. The laptop shows `phone connected, ~60 Hz`.
4. Hold the phone upright, screen facing you, top up, and tap **RECENTER**. The game starts.
5. Click once on the laptop to enable its sound (a browser rule).

The server makes a new certificate each time it starts, so both devices ask you to accept it again after a restart.

## Play

| Phone | Racket |
| --- | --- |
| Screen toward the laptop | Forehand (red) |
| Back of the phone toward the laptop | Backhand (black) |
| Top tilted back toward you | Open face |
| Top tilted toward the laptop | Closed face |
| Held still | Block |
| Quick forward wrist flick | Drive |
| Phone tilted sideways, brushed upward | Topspin |
| Hand moving left or right in front of the webcam | Racket travels left and right |
| Thumb sliding on the **MOVE** pad | Same, as a backup or a small correction |

The swing comes from wrist rotation around the bottom of the phone. A phone held perfectly vertical can't produce upward racket speed, so tilt its top about 45 to 60 degrees to the side for topspin.

RECENTER turns the camera on (allow it on the laptop). Keep the hand holding the phone in view, with your fingers visible around it. Where your hand is when you tap RECENTER becomes the middle of the table. **C** turns camera tracking off or retries it, and **H** switches it to your other hand when both are in view. To change how far the racket travels, set `APP.C.CAM_REACH` in the laptop's console.

With the thumb pad, slide toward your right to go right, whichever way the phone faces. The racket's height follows the ball automatically. A ring shows where the ball will arrive and turns green when your racket is there. Once you are close, the racket snaps onto the ball (less on higher assist levels, not at all on `pro`). The racket also turns around your wrist, so tilting the phone adds some reach.

Keys: **T** switches between phone and hand/mouse, **D** shows the debug HUD, **X** flips left and right if your phone reports them reversed. The original keys still work.

## Tuning

Press **D** and play a relaxed forehand. The `peak` line should read about 2 m/s. To change it, run this in the laptop's browser console:

```js
APP.C.SWING_GAIN = 0.7
```

When it feels right, put the value in `C` in `air-ping-pong.html`.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Phone can't open the page | Check that both are on the same Wi-Fi. Guest and campus networks often block devices from reaching each other, so use the tunnel below. |
| Windows blocks the connection | In an admin PowerShell: `New-NetFirewallRule -DisplayName "Air Ping Pong" -Direction Inbound -Protocol TCP -LocalPort 8443 -RemoteAddress LocalSubnet -Action Allow` |
| `No motion events` in the phone log | In Chrome: site settings, then allow **Motion sensors**. The page must be `https`. |
| Racket points the wrong way | Hold the phone upright, screen facing you, and tap RECENTER again. Do this whenever it drifts. |
| No buzz | Check that vibration is on in the phone's settings and that Do Not Disturb is off. The click sound still plays. |
| No click sound | Turn up the phone's media volume. |
| iPhone refuses the WebSocket | Use the tunnel below. |
| Port already in use | Close the other server, then run `npm start` again. |

### Tunnel fallback

With [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) installed, run this in a second terminal:

```
cloudflared tunnel --url http://localhost:8080
```

Copy the `https://….trycloudflare.com` URL, then restart the server with it (PowerShell):

```powershell
$env:PUBLIC_URL="https://your-url.trycloudflare.com"; npm start
```

The QR code now uses the tunnel. Anyone with the full link and room code can join while the tunnel is running, so close it when you finish.
