/**
 * Windows-only Android build fix, applied on every `expo prebuild`.
 *
 * CMake object paths repeat the full source path (for example
 * `…/CMakeFiles/x.dir/D_/<project>/node_modules/<lib>/…/File.cpp.o`), which
 * overflows the 260-character MAX_PATH under a long project path and fails
 * with "Filename longer than 260 characters". Native modules therefore build
 * in a short folder, and CMake hashes the directory part of any object path
 * longer than 250 characters.
 */
const { withProjectBuildGradle } = require('expo/config-plugins');

const MARKER = '// @generated with-windows-native-paths';

const SNIPPET = `${MARKER}
if (System.getProperty('os.name').toLowerCase().contains('windows')) {
  subprojects {
    ['com.android.library', 'com.android.application'].each { pluginId ->
      plugins.withId(pluginId) {
        android.externalNativeBuild.cmake.buildStagingDirectory = "C:/rnb/\${project.name}"
        android.defaultConfig.externalNativeBuild.cmake.arguments('-DCMAKE_OBJECT_PATH_MAX=250')
      }
    }
  }
}
`;

module.exports = function withWindowsNativePaths(config) {
  return withProjectBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') {
      throw new Error('with-windows-native-paths: expected a Groovy android/build.gradle.');
    }
    if (!mod.modResults.contents.includes(MARKER)) {
      mod.modResults.contents = mod.modResults.contents.replace(
        'apply plugin: "expo-root-project"',
        `${SNIPPET}\napply plugin: "expo-root-project"`,
      );
    }
    return mod;
  });
};
