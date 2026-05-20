#include "ui/RightPanelWidget.h"

#include <QFormLayout>
#include <QLabel>
#include <QListWidget>
#include <QPushButton>
#include <QString>
#include <QStringList>
#include <QTabWidget>
#include <QVBoxLayout>

namespace {

QWidget* tabWithList(const QStringList& entries)
{
    auto* widget = new QWidget;
    auto* layout = new QVBoxLayout(widget);
    auto* list = new QListWidget(widget);
    list->addItems(entries);
    layout->addWidget(list);
    return widget;
}

} // namespace

namespace yjcad {

RightPanelWidget::RightPanelWidget(QWidget* parent)
    : QWidget(parent)
{
    auto* layout = new QVBoxLayout(this);
    layout->setContentsMargins(0, 0, 0, 0);

    auto* tabs = new QTabWidget(this);
    tabs->addTab(createAutomationTab(), QStringLiteral("자동화"));
    tabs->addTab(createValidationTab(), QStringLiteral("검수"));
    tabs->addTab(createReportTab(), QStringLiteral("리포트"));
    tabs->addTab(createLayerTab(), QStringLiteral("레이어/속성"));
    tabs->addTab(createDrawingInfoTab(), QStringLiteral("도면 정보"));
    tabs->addTab(createSequenceTab(), QStringLiteral("시퀀스"));
    layout->addWidget(tabs);
}

QWidget* RightPanelWidget::createAutomationTab()
{
    auto* widget = new QWidget;
    auto* layout = new QVBoxLayout(widget);
    const QStringList commands = {
        QStringLiteral("오시/칼선 구분"),
        QStringLiteral("브릿지 삽입"),
        QStringLiteral("도면 정보 분석"),
        QStringLiteral("합판 생성"),
        QStringLiteral("출력 전 검수")
    };
    for (const auto& label : commands) {
        layout->addWidget(new QPushButton(label, widget));
    }
    layout->addStretch(1);
    return widget;
}

QWidget* RightPanelWidget::createValidationTab()
{
    return tabWithList({
        QStringLiteral("대기: 출력 전 검수"),
        QStringLiteral("대기: 미확정 오시/칼선"),
        QStringLiteral("대기: 브릿지 결과")
    });
}

QWidget* RightPanelWidget::createReportTab()
{
    return tabWithList({
        QStringLiteral("가져오기 리포트 대기"),
        QStringLiteral("자동화 실행 결과 대기"),
        QStringLiteral("최종 검수 리포트 대기")
    });
}

QWidget* RightPanelWidget::createLayerTab()
{
    auto* widget = new QWidget;
    auto* layout = new QFormLayout(widget);
    layout->addRow(QStringLiteral("선택 수"), new QLabel(QStringLiteral("0"), widget));
    layout->addRow(QStringLiteral("레이어"), new QLabel(QStringLiteral("-"), widget));
    layout->addRow(QStringLiteral("색상"), new QLabel(QStringLiteral("-"), widget));
    return widget;
}

QWidget* RightPanelWidget::createDrawingInfoTab()
{
    auto* widget = new QWidget;
    auto* layout = new QFormLayout(widget);
    layout->addRow(QStringLiteral("전체 칼선 크기"), new QLabel(QStringLiteral("-"), widget));
    layout->addRow(QStringLiteral("업체명"), new QLabel(QStringLiteral("-"), widget));
    layout->addRow(QStringLiteral("제품명"), new QLabel(QStringLiteral("-"), widget));
    layout->addRow(QStringLiteral("인쇄지"), new QLabel(QStringLiteral("-"), widget));
    layout->addRow(QStringLiteral("정타/후타"), new QLabel(QStringLiteral("-"), widget));
    return widget;
}

QWidget* RightPanelWidget::createSequenceTab()
{
    auto* widget = new QWidget;
    auto* layout = new QVBoxLayout(widget);
    layout->addWidget(new QLabel(QStringLiteral("자동 시퀀스는 후속 단계에서 연결합니다."), widget));
    layout->addStretch(1);
    return widget;
}

} // namespace yjcad
