#pragma once

#include <QMainWindow>

namespace yjcad {

class MainWindow final : public QMainWindow {
    Q_OBJECT

public:
    explicit MainWindow(QWidget* parent = nullptr);

private:
    void createToolbar();
    void createDocks();
};

} // namespace yjcad
