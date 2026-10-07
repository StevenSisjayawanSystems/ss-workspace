import { useEffect } from 'react'
import { useGame } from './game'
import { Jukebox } from './music/Jukebox'
import { connect } from './net/net'
import { Scene } from './scene/Scene'
import { CallBar } from './ui/CallBar'
import { Chat } from './ui/Chat'
import { Hud } from './ui/Hud'
import { Join } from './ui/Join'
import { Joystick } from './ui/Joystick'

export function App() {
  const profile = useGame((s) => s.profile)
  const touch = matchMedia('(pointer: coarse)').matches

  useEffect(() => {
    if (profile) connect(profile)
  }, [profile])

  // Before you enter, the same world plays behind the title card as a slow fly-over.
  return (
    <>
      <Scene profile={profile} />
      {profile ? (
        <>
          <Hud />
          <Chat />
          <Jukebox />
          <CallBar />
          {touch && <Joystick />}
        </>
      ) : (
        <Join />
      )}
    </>
  )
}
