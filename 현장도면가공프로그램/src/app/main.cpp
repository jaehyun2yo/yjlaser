#include "app/MainWindow.h"
#include "config/AppEnvironment.h"
#include "logging/Logger.h"

#include <QApplication>
#include <QCoreApplication>
#include <QString>

#include <filesystem>

int main(int argc, char* argv[])
{
    QApplication app(argc, argv);

    const auto mode = yjcad::runtimeModeFromEnvironment();
    const auto appDirectory = std::filesystem::path(QCoreApplication::applicationDirPath().toStdWString());
    yjcad::initializeLogging({
        .mode = mode,
        .logDirectory = appDirectory / "logs",
        .console = yjcad::isDevelopment(mode)
    });
    yjcad::appLogger()->info("application starting");

    yjcad::MainWindow window;
    window.show();

    const int result = app.exec();
    yjcad::appLogger()->info("application exiting code={}", result);
    return result;
}
