import { useEffect } from 'react'
import { useGame } from './game'
import { Jukebox } from './music/Jukebox'
import { Meditation } from './music/Meditation'
import { sendProgress, useNet } from './net/net'
import { Scene } from './scene/Scene'
import { startStats } from './stats'
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

  // Progress only accrues once you are inside.
  useEffect(() => {
    if (profile) return startStats(sendProgress, () => useNet.getState().inCall)
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
