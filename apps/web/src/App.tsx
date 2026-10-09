import { useGame } from './game'
import { Jukebox } from './music/Jukebox'
import { Meditation } from './music/Meditation'
import { Scene } from './scene/Scene'
import { Board } from './ui/Board'
import { CallBar } from './ui/CallBar'
import { Chat } from './ui/Chat'
import { Hud } from './ui/Hud'
import { Join } from './ui/Join'
import { Schedule } from './ui/Schedule'
import { Joystick } from './ui/Joystick'

export function App() {
  const profile = useGame((s) => s.profile)
  const touch = matchMedia('(pointer: coarse)').matches

  // Before you enter, the same world plays behind the title card as a slow fly-over.
  return (
    <>
      <Scene profile={profile} />
      {profile ? (
        <>
          <Hud />
          <Chat />
          <Jukebox />
          <Meditation />
          <CallBar />
          <Board />
          <Schedule />
          {touch && <Joystick />}
        </>
      ) : (
        <Join />
      )}
    </>
  )
}
