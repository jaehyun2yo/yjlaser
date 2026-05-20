#include "app/MainWindow.h"

#include "canvas/CadCanvasWidget.h"
#include "ui/RightPanelWidget.h"
#include "ui/StatusLogWidget.h"
#include "ui/ToolPanelWidget.h"

#include <QDockWidget>
#include <QString>
#include <QToolBar>
#include <Qt>

namespace yjcad {

MainWindow::MainWindow(QWidget* parent)
    : QMainWindow(parent)
{
    setWindowTitle(QStringLiteral("현장도면가공프로그램"));
    resize(1280, 800);
    setCentralWidget(new CadCanvasWidget(this));
    createToolbar();
    createDocks();
}

void MainWindow::createToolbar()
{
    auto* toolbar = addToolBar(QStringLiteral("주요 실행"));
    toolbar->setMovable(false);
    toolbar->addAction(QStringLiteral("열기"));
    toolbar->addAction(QStringLiteral("저장"));
    toolbar->addAction(QStringLiteral("DXF 출력"));
    toolbar->addSeparator();
    toolbar->addAction(QStringLiteral("되돌리기"));
    toolbar->addAction(QStringLiteral("다시 실행"));
    toolbar->addSeparator();
    toolbar->addAction(QStringLiteral("확대"));
    toolbar->addAction(QStringLiteral("축소"));
    toolbar->addAction(QStringLiteral("맞춤"));
}

void MainWindow::createDocks()
{
    auto* toolDock = new QDockWidget(QStringLiteral("작성/수정"), this);
    toolDock->setWidget(new ToolPanelWidget(toolDock));
    addDockWidget(Qt::LeftDockWidgetArea, toolDock);

    auto* rightDock = new QDockWidget(QStringLiteral("자동화/검수"), this);
    rightDock->setWidget(new RightPanelWidget(rightDock));
    addDockWidget(Qt::RightDockWidgetArea, rightDock);

    auto* statusDock = new QDockWidget(QStringLiteral("상태/로그"), this);
    statusDock->setWidget(new StatusLogWidget(statusDock));
    addDockWidget(Qt::BottomDockWidgetArea, statusDock);
}

} // namespace yjcad
