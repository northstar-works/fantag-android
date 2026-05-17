package com.northstarlabs.fantag

import android.os.Bundle
import android.text.InputType
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.preference.EditTextPreference
import androidx.preference.Preference
import androidx.preference.PreferenceFragmentCompat
import androidx.preference.PreferenceManager
import com.northstarlabs.fantag.databinding.ActivitySettingsBinding

class SettingsActivity : AppCompatActivity() {

    private lateinit var binding: ActivitySettingsBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySettingsBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)

        if (savedInstanceState == null) {
            supportFragmentManager
                .beginTransaction()
                .replace(R.id.settings_container, SettingsFragment())
                .commit()
        }
    }

    override fun onSupportNavigateUp(): Boolean {
        onBackPressedDispatcher.onBackPressed()
        return true
    }

    class SettingsFragment : PreferenceFragmentCompat() {

        override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
            setPreferencesFromResource(R.xml.preferences, rootKey)

            // Server URL preference
            val serverUrlPref = findPreference<EditTextPreference>(MainActivity.PREF_SERVER_URL)
            serverUrlPref?.apply {
                // Show URL input keyboard
                setOnBindEditTextListener { editText ->
                    editText.inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
                }

                // Show current value as summary
                val prefs = PreferenceManager.getDefaultSharedPreferences(requireContext())
                summary = prefs.getString(MainActivity.PREF_SERVER_URL, MainActivity.DEFAULT_URL)

                onPreferenceChangeListener = Preference.OnPreferenceChangeListener { pref, newValue ->
                    val url = (newValue as? String)?.trim() ?: ""
                    if (url.isBlank()) {
                        Toast.makeText(context, "URL cannot be empty", Toast.LENGTH_SHORT).show()
                        return@OnPreferenceChangeListener false
                    }
                    if (!url.startsWith("http://") && !url.startsWith("https://")) {
                        Toast.makeText(context, "URL must start with http:// or https://", Toast.LENGTH_SHORT).show()
                        return@OnPreferenceChangeListener false
                    }
                    pref.summary = url
                    Toast.makeText(context, "Server URL saved.", Toast.LENGTH_SHORT).show()
                    true
                }
            }

            // Reset to default
            val resetPref = findPreference<Preference>("reset_url")
            resetPref?.onPreferenceClickListener = Preference.OnPreferenceClickListener {
                val prefs = PreferenceManager.getDefaultSharedPreferences(requireContext())
                prefs.edit().putString(MainActivity.PREF_SERVER_URL, MainActivity.DEFAULT_URL).apply()
                serverUrlPref?.summary = MainActivity.DEFAULT_URL
                Toast.makeText(context, "Reset to default URL", Toast.LENGTH_SHORT).show()
                true
            }

            // App version info
            val versionPref = findPreference<Preference>("app_version")
            versionPref?.summary = "Android v3.2.9-b66-stable-no-push / Fantag web target v3.2.9 build 65"

            // Clear WebView cache
            val clearCachePref = findPreference<Preference>("clear_cache")
            clearCachePref?.onPreferenceClickListener = Preference.OnPreferenceClickListener {
                android.webkit.WebStorage.getInstance().deleteAllData()
                requireContext().cacheDir.deleteRecursively()
                Toast.makeText(context, "Cache cleared", Toast.LENGTH_SHORT).show()
                true
            }
        }
    }
}
