#pragma once

#include <QWidget>

namespace yjcad {

class RightPanelWidget final : public QWidget {
    Q_OBJECT

public:
    explicit RightPanelWidget(QWidget* parent = nullptr);

private:
    QWidget* createAutomationTab();
    QWidget* createValidationTab();
    QWidget* createReportTab();
    QWidget* createLayerTab();
    QWidget* createDrawingInfoTab();
    QWidget* createSequenceTab();
};

} // namespace yjcad
