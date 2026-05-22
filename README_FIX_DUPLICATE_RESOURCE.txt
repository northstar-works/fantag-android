Fix for Gradle duplicate resource:

The build failed because Android found BOTH:
  app/src/main/res/drawable/ic_launcher_foreground.png
  app/src/main/res/drawable/ic_launcher_foreground.xml

Android resources cannot have the same name in the same resource type, even if one is .png and one is .xml.

This fixed pack does NOT add drawable/ic_launcher_foreground.png.
It updates:
  app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml
  app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml

to point at:
  @drawable/fantag_icon_full_rounded
  @drawable/fantag_icon_full_circle

which are stored in drawable-nodpi.

After extracting into the fantag-android repo root, delete the duplicate PNG:
  del app\src\main\res\drawable\ic_launcher_foreground.png

or run:
  delete_duplicate_launcher_foreground_windows.bat

Then commit and push.
