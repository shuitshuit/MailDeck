import java.io.File
import org.apache.tools.ant.taskdefs.condition.Os
import org.gradle.api.DefaultTask
import org.gradle.api.GradleException
import org.gradle.api.logging.LogLevel
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.TaskAction

open class BuildTask : DefaultTask() {
    @Input
    var rootDirRel: String? = null
    @Input
    var target: String? = null
    @Input
    var release: Boolean? = null

    @TaskAction
    fun assemble() {
        if (Os.isFamily(Os.FAMILY_WINDOWS)) {
            runTauriCliWindows()
        } else {
            runTauriCli("npm")
        }
    }

    fun runTauriCliWindows() {
        val rootDirRel = rootDirRel ?: throw GradleException("rootDirRel cannot be null")
        val target = target ?: throw GradleException("target cannot be null")
        val release = release ?: throw GradleException("release cannot be null")
        val npmArgs = listOf("npm", "run", "--", "tauri", "android", "android-studio-script")
        val args = mutableListOf<String>().apply {
            addAll(npmArgs)
            if (project.logger.isEnabled(LogLevel.DEBUG)) add("-vv")
            else if (project.logger.isEnabled(LogLevel.INFO)) add("-v")
            if (release) add("--release")
            addAll(listOf("--target", target))
        }

        // Windows では cmd /c 経由で実行することで .cmd スクリプトを解決できる
        project.exec {
            workingDir(File(project.projectDir, rootDirRel))
            executable("cmd")
            args(listOf("/c") + args)
        }.assertNormalExitValue()
    }

    fun runTauriCli(executable: String) {
        val rootDirRel = rootDirRel ?: throw GradleException("rootDirRel cannot be null")
        val target = target ?: throw GradleException("target cannot be null")
        val release = release ?: throw GradleException("release cannot be null")
        val args = listOf("run", "--", "tauri", "android", "android-studio-script");

        project.exec {
            workingDir(File(project.projectDir, rootDirRel))
            executable(executable)
            args(args)
            if (project.logger.isEnabled(LogLevel.DEBUG)) {
                args("-vv")
            } else if (project.logger.isEnabled(LogLevel.INFO)) {
                args("-v")
            }
            if (release) {
                args("--release")
            }
            args(listOf("--target", target))
        }.assertNormalExitValue()
    }
}