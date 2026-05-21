# Fantag Android b85 workflow YAML line 205 fix

This zip contains a corrected `.github/workflows/build-and-publish-fdroid.yml`.

It fixes the invalid YAML caused by heredoc content not being indented inside the `run: |` block.

Copy the workflow file into `C:\Users\Sidscri\Documents\GitHub\fantag-android\.github\workflows\build-and-publish-fdroid.yml`, then commit and push.
