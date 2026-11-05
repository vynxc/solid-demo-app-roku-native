' Copyright (c) 2026 Roku, Inc.
' SPDX-License-Identifier: MIT

sub init()
    print "BaseAppScene init"

    di = CreateObject("roDeviceInfo")
    uiResolution = di.GetUIResolution()

    print "uiResolution: "; uiResolution.name

    ' Set a simple background color for the scene
    m.top.backgroundColor = "0x000000FF"

    myFirstApp = m.top.findNode("myFirstApp")
    if myFirstApp <> invalid
        print "MyFirstApp component found and initialized"
        myFirstApp.setFocus(true) ' Set initial focus to the MyFirstApp component
    else
        print "ERROR: MyFirstApp component (id myFirstApp) not found; initial focus not set"
    end if
end sub
